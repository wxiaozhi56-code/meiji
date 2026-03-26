import express from "express";
import cors from "cors";
import multer from "multer";
import { getSupabaseClient } from "./storage/database/supabase-client";
import { ASRClient, LLMClient, Config, HeaderUtils, S3Storage } from "coze-coding-dev-sdk";

const app = express();
const port = process.env.PORT || 9091;

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health check
app.get('/api/v1/health', (req, res) => {
  console.log('Health check success');
  res.status(200).json({ status: 'ok' });
});

// Initialize S3 Storage
const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

// Upload and process audio file
app.post('/api/v1/upload/audio', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const { buffer, originalname, mimetype } = req.file;
    const customerId = req.body.customerId;

    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }

    // 1. Upload to object storage
    const fileName = `voice/${Date.now()}_${originalname || 'audio.m4a'}`;
    const key = await storage.uploadFile({
      fileContent: buffer,
      fileName,
      contentType: mimetype || 'audio/mp4',
    });

    // Generate signed URL for ASR
    const audioUrl = await storage.generatePresignedUrl({
      key,
      expireTime: 3600,
    });

    console.log('Audio uploaded:', audioUrl);

    // 2. Speech recognition (ASR)
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();
    const asrClient = new ASRClient(config, customHeaders);

    const asrResult = await asrClient.recognize({
      uid: 'user123',
      url: audioUrl,
    });

    console.log('ASR Result:', asrResult.text);

    // 3. Extract tags using LLM
    const llmClient = new LLMClient(config, customHeaders);
    const prompt = `你是一个美容院客户关系管理助手。请从以下客户信息中提取关键标签。

客户信息：
${asrResult.text}

请提取3-5个标签，格式为JSON数组：
[{"tag_name": "#标签名", "category": "分类"}]

分类包括：家庭动态、健康状况、皮肤状况、抗衰需求、消费偏好

只返回JSON数组，不要其他内容。`;

    const messages = [{ role: 'user' as const, content: prompt }];
    const llmResult = await llmClient.invoke(messages, { temperature: 0.3 });

    // Parse tags
    let tags = [];
    try {
      tags = JSON.parse(llmResult.content);
    } catch (e) {
      console.error('Failed to parse tags:', e);
      tags = [{ tag_name: '#新跟进', category: '消费偏好' }];
    }

    // 4. Save to database
    const supabase = getSupabaseClient();
    const { data: followUpRecord, error: followUpError } = await supabase
      .from('follow_up_records')
      .insert({
        customer_id: parseInt(customerId),
        content: asrResult.text,
        audio_url: audioUrl,
      })
      .select()
      .single();

    if (followUpError) throw followUpError;

    // Save tags
    if (tags.length > 0) {
      const tagInserts = tags.map((tag: any) => ({
        customer_id: parseInt(customerId),
        tag_name: tag.tag_name,
        category: tag.category,
      }));

      const { error: tagsError } = await supabase
        .from('customer_tags')
        .insert(tagInserts);

      if (tagsError) console.error('Failed to save tags:', tagsError);
    }

    res.json({
      success: true,
      text: asrResult.text,
      tags,
      followUpRecord,
    });
  } catch (error: any) {
    console.error('Error processing audio:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all customers
app.get('/api/v1/customers', async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('customers')
      .select(`
        *,
        customer_tags (*)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new customer
app.post('/api/v1/customers', async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { name, phone, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: '客户姓名不能为空' });
    }

    // Create customer
    const { data: customer, error: customerError } = await client
      .from('customers')
      .insert({ name: name.trim(), phone: phone?.trim() || null })
      .select()
      .single();

    if (customerError) throw customerError;

    // If notes provided, extract tags and save
    if (notes && notes.trim()) {
      // Simple tag extraction: find #tag patterns
      const tagMatches = notes.match(/#[\u4e00-\u9fa5a-zA-Z0-9]+/g);
      if (tagMatches && tagMatches.length > 0) {
        const tagInserts = tagMatches.map((tag: string) => ({
          customer_id: customer.id,
          tag_name: tag,
          category: '消费偏好', // Default category
        }));

        await client.from('customer_tags').insert(tagInserts);
      }

      // Save as follow-up record
      await client.from('follow_up_records').insert({
        customer_id: customer.id,
        content: notes.trim(),
      });
    }

    // Fetch complete customer data
    const { data: fullCustomer, error: fetchError } = await client
      .from('customers')
      .select(`*, customer_tags (*)`)
      .eq('id', customer.id)
      .single();

    if (fetchError) throw fetchError;
    res.status(201).json(fullCustomer);
  } catch (error: any) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get customer by ID
app.get('/api/v1/customers/:id', async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { id } = req.params;

    const { data, error } = await client
      .from('customers')
      .select(`
        *,
        customer_tags (*),
        follow_up_records (*),
        ai_briefs (*),
        generated_messages (*),
        customer_profiles (*)
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // 过滤掉过期的智能话术（expires_at < now）
    if (data.generated_messages && data.generated_messages.length > 0) {
      const now = new Date();
      data.generated_messages = data.generated_messages.filter(
        (msg: any) => !msg.expires_at || new Date(msg.expires_at) > now
      );
    }

    res.json(data);
  } catch (error: any) {
    console.error('Error fetching customer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update customer profile field (upsert)
app.post('/api/v1/customer-profiles', async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { customerId, fieldName, fieldValue } = req.body;

    if (!customerId || !fieldName) {
      return res.status(400).json({ error: 'customerId and fieldName are required' });
    }

    // Upsert: 如果存在则更新，不存在则插入
    const { data, error } = await client
      .from('customer_profiles')
      .upsert({
        customer_id: customerId,
        field_name: fieldName,
        field_value: fieldValue || '',
      }, {
        onConflict: 'customer_id,field_name'
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error('Error updating customer profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete customer profile field
app.delete('/api/v1/customer-profiles/:id', async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { id } = req.params;

    const { error } = await client
      .from('customer_profiles')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true, message: '资料已删除' });
  } catch (error: any) {
    console.error('Error deleting customer profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete customer by ID
app.delete('/api/v1/customers/:id', async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { id } = req.params;

    // Delete customer (cascade will delete related data)
    const { error } = await client
      .from('customers')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true, message: '客户已删除' });
  } catch (error: any) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Process voice recording (ASR + tag extraction)
app.post('/api/v1/voice/process', async (req, res) => {
  try {
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();
    const asrClient = new ASRClient(config, customHeaders);
    const llmClient = new LLMClient(config, customHeaders);

    const { audioUrl, customerId } = req.body;

    if (!audioUrl) {
      return res.status(400).json({ error: 'Audio URL is required' });
    }

    // Step 1: Speech recognition
    const asrResult = await asrClient.recognize({
      uid: 'user123',
      url: audioUrl,
    });

    console.log('ASR Result:', asrResult.text);

    // Step 2: Extract tags using LLM
    const prompt = `你是一个美容院客户关系管理助手。请从以下客户信息中提取关键标签。

客户信息：
${asrResult.text}

请提取3-5个标签，格式为JSON数组：
[{"tag_name": "#标签名", "category": "分类"}]

分类包括：家庭动态、健康状况、皮肤状况、抗衰需求、消费偏好

只返回JSON数组，不要其他内容。`;

    const messages = [{ role: 'user' as const, content: prompt }];
    const llmResult = await llmClient.invoke(messages, { temperature: 0.3 });

    // Parse tags
    let tags = [];
    try {
      tags = JSON.parse(llmResult.content);
    } catch (e) {
      console.error('Failed to parse tags:', e);
      // Fallback: extract simple tags
      tags = [
        { tag_name: '#新跟进', category: '消费偏好' }
      ];
    }

    // Save to database
    const supabase = getSupabaseClient();
    const { data: followUpRecord, error: followUpError } = await supabase
      .from('follow_up_records')
      .insert({
        customer_id: customerId,
        content: asrResult.text,
        audio_url: audioUrl,
      })
      .select()
      .single();

    if (followUpError) throw followUpError;

    // Save tags
    if (tags.length > 0) {
      const tagInserts = tags.map((tag: any) => ({
        customer_id: customerId,
        tag_name: tag.tag_name,
        category: tag.category,
      }));

      const { error: tagsError } = await supabase
        .from('customer_tags')
        .insert(tagInserts);

      if (tagsError) console.error('Failed to save tags:', tagsError);
    }

    res.json({
      text: asrResult.text,
      tags,
      followUpRecord,
    });
  } catch (error: any) {
    console.error('Error processing voice:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate AI brief
app.post('/api/v1/ai/brief', async (req, res) => {
  try {
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();
    const llmClient = new LLMClient(config, customHeaders);

    const { customerId } = req.body;

    // Fetch customer data
    const supabase = getSupabaseClient();
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select(`
        *,
        customer_tags (*),
        follow_up_records (*)
      `)
      .eq('id', customerId)
      .maybeSingle();

    if (customerError) throw customerError;
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Generate AI brief using LLM
    const prompt = `你是一个美容院客户关系管理助手。请根据以下客户信息生成客户简报和跟进建议。

客户信息：
姓名：${customer.name}
标签：${JSON.stringify(customer.customer_tags)}
最近跟进记录：${JSON.stringify(customer.follow_up_records?.slice(-3))}

请生成：
1. 客户近况摘要（一句话）
2. 3个跟进建议（每个建议包含类型和内容）

返回JSON格式：
{
  "summary": "客户近况摘要",
  "suggestions": [
    {"type": "关怀点", "content": "具体建议"},
    {"type": "推荐项目", "content": "具体建议"},
    {"type": "避坑提醒", "content": "具体建议"}
  ]
}

只返回JSON，不要其他内容。`;

    const messages = [{ role: 'user' as const, content: prompt }];
    const llmResult = await llmClient.invoke(messages, { temperature: 0.7 });

    // Parse result
    let brief;
    try {
      brief = JSON.parse(llmResult.content);
    } catch (e) {
      console.error('Failed to parse brief:', e);
      brief = {
        summary: '客户数据正在分析中',
        suggestions: [
          { type: '建议', content: '请稍后再试' }
        ]
      };
    }

    // Save to database
    const { data: savedBrief, error: briefError } = await supabase
      .from('ai_briefs')
      .insert({
        customer_id: customerId,
        summary: brief.summary,
        suggestions: brief.suggestions,
      })
      .select()
      .single();

    if (briefError) throw briefError;

    res.json(savedBrief);
  } catch (error: any) {
    console.error('Error generating brief:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get follow-up record by ID
app.get('/api/v1/follow-up-records/:id', async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { id } = req.params;

    const { data, error } = await client
      .from('follow_up_records')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Follow-up record not found' });
    }
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching follow-up record:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate messages
app.post('/api/v1/ai/messages', async (req, res) => {
  try {
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();
    const llmClient = new LLMClient(config, customHeaders);

    const { customerId, followUpRecordId, customContext } = req.body;

    // Fetch customer data
    const supabase = getSupabaseClient();
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select(`
        *,
        customer_tags (*),
        ai_briefs (*)
      `)
      .eq('id', customerId)
      .maybeSingle();

    if (customerError) throw customerError;
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // 获取关联的跟进记录
    let followUpRecord = null;
    if (followUpRecordId) {
      const { data: record, error: recordError } = await supabase
        .from('follow_up_records')
        .select('*')
        .eq('id', followUpRecordId)
        .maybeSingle();
      
      if (!recordError && record) {
        followUpRecord = record;
      }
    }

    const latestBrief = customer.ai_briefs?.[customer.ai_briefs.length - 1];
    const tags = customer.customer_tags || [];

    // Generate messages using LLM
    let promptContext = '';
    
    if (followUpRecord) {
      promptContext = `基于以下跟进记录生成话术：

跟进记录：${followUpRecord.content}
记录时间：${followUpRecord.created_at?.split('T')[0]}`;
    } else {
      promptContext = `客户信息：
姓名：${customer.name}
标签：${tags.map((t: any) => t.tag_name).join('、') || '暂无'}
客户简报：${latestBrief?.summary || '暂无'}`;
    }

    const prompt = `你是一个美容院客户关系管理助手。请根据以下信息生成3条跟进话术。

${promptContext}
${customContext ? `\n额外上下文：${customContext}` : ''}

要求：
1. 话术要亲切自然，符合美容师与客户的关系，用"姐"称呼客户
2. 每条话术要有不同的侧重点：
   - 关怀型：关注客户近况，表达关心
   - 价值型：提供有价值的信息或建议
   - 互动型：创造互动机会，增进关系
3. 话术长度适中（30-50字），便于微信发送
4. 不要过于推销，要自然亲切

返回JSON格式：
{
  "messages": [
    {"type": "关怀型", "content": "话术内容"},
    {"type": "价值型", "content": "话术内容"},
    {"type": "互动型", "content": "话术内容"}
  ]
}

只返回JSON，不要其他内容。`;

    const messages = [{ role: 'user' as const, content: prompt }];
    const llmResult = await llmClient.invoke(messages, { temperature: 0.8 });

    // Parse result
    let generatedMessages;
    try {
      generatedMessages = JSON.parse(llmResult.content);
    } catch (e) {
      console.error('Failed to parse messages:', e);
      generatedMessages = {
        messages: [
          { type: '建议', content: '话术生成中，请稍后再试' }
        ]
      };
    }

    // 删除该客户所有旧话术，只保留最新的3条
    await supabase
      .from('generated_messages')
      .delete()
      .eq('customer_id', customerId);

    // Save to database - 设置10分钟后过期
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10分钟后
    const messageInserts = generatedMessages.messages.map((msg: any) => ({
      customer_id: customerId,
      follow_up_record_id: followUpRecordId || null,
      brief_id: latestBrief?.id || null,
      content: msg.content,
      type: msg.type,
      expires_at: expiresAt.toISOString(),
    }));

    const { data: savedMessages, error: messagesError } = await supabase
      .from('generated_messages')
      .insert(messageInserts)
      .select();

    if (messagesError) throw messagesError;

    res.json(savedMessages);
  } catch (error: any) {
    console.error('Error generating messages:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== 智能跟进仪表盘 API ====================

// 计算单个客户的跟进优先级
async function calculateCustomerPriority(client: any, customer: any) {
  let priority = 50; // 基础分
  let suggestedAction = '微信关怀';
  let suggestedTiming = '本周内';
  let reasons: string[] = [];

  // 1. 计算距上次联系天数
  const lastRecord = customer.follow_up_records?.[customer.follow_up_records?.length - 1];
  let lastContactDays = 999;
  if (lastRecord?.created_at) {
    const lastDate = new Date(lastRecord.created_at);
    const now = new Date();
    lastContactDays = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  // 2. 根据天数调整优先级
  if (lastContactDays >= 30) {
    priority += 30;
    suggestedTiming = '今天';
    reasons.push('超过30天未跟进');
  } else if (lastContactDays >= 14) {
    priority += 20;
    suggestedTiming = '今天';
    reasons.push('超过两周未跟进');
  } else if (lastContactDays >= 7) {
    priority += 10;
    suggestedTiming = '本周内';
    reasons.push('一周未跟进');
  } else if (lastContactDays <= 3) {
    priority -= 10; // 刚跟进过，降低优先级
  }

  // 3. 根据标签调整优先级
  const tags = customer.customer_tags || [];
  const tagNames = tags.map((t: any) => t.tag_name);
  
  if (tagNames.some((t: string) => t.includes('VIP') || t.includes('高意向'))) {
    priority += 15;
    reasons.push('VIP/高意向客户');
  }
  if (tagNames.some((t: string) => t.includes('沉睡'))) {
    priority += 20;
    suggestedTiming = '今天';
    reasons.push('沉睡客户需激活');
  }
  if (tagNames.some((t: string) => t.includes('到期') || t.includes('续费'))) {
    priority += 25;
    suggestedTiming = '今天';
    suggestedAction = '活动邀约';
    reasons.push('即将到期/续费');
  }

  // 4. 根据客户资料判断
  const profiles = customer.customer_profiles || [];
  profiles.forEach((p: any) => {
    if (p.field_name.includes('套餐') && p.field_value) {
      // 有购买套餐的优先
      priority += 5;
    }
  });

  // 5. 限制优先级范围
  priority = Math.max(0, Math.min(100, priority));

  // 6. AI生成建议原因
  let reason = reasons.join('；') || '建议定期跟进维护关系';

  return {
    priority,
    suggestedAction,
    suggestedTiming,
    reason,
    lastContactDays
  };
}

// 计算所有客户的跟进优先级
app.post('/api/v1/follow-up-plans/calculate', async (req, res) => {
  try {
    const client = getSupabaseClient();
    
    // 获取所有客户及其相关数据
    const { data: customers, error: customersError } = await client
      .from('customers')
      .select(`
        *,
        customer_tags (*),
        customer_profiles (*),
        follow_up_records (*)
      `);

    if (customersError) throw customersError;

    const plans = [];

    for (const customer of customers || []) {
      const priorityData = await calculateCustomerPriority(client, customer);

      // Upsert跟进计划
      const { error: upsertError } = await client
        .from('follow_up_plans')
        .upsert({
          customer_id: customer.id,
          priority: priorityData.priority,
          suggested_action: priorityData.suggestedAction,
          suggested_timing: priorityData.suggestedTiming,
          reason: priorityData.reason,
          last_contact_days: priorityData.lastContactDays,
          calculated_at: new Date().toISOString(),
        }, {
          onConflict: 'customer_id'
        });

      if (upsertError) {
        console.error(`Failed to upsert plan for customer ${customer.id}:`, upsertError);
      } else {
        plans.push({
          customerId: customer.id,
          customerName: customer.name,
          ...priorityData
        });
      }
    }

    res.json({ 
      success: true, 
      message: `已计算 ${plans.length} 个客户的跟进优先级`,
      calculatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error calculating follow-up plans:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取待跟进客户列表（仪表盘）
app.get('/api/v1/follow-up-plans', async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { timing } = req.query; // today, this_week, all

    let query = client
      .from('follow_up_plans')
      .select(`
        *,
        customers (
          id,
          name,
          phone,
          customer_tags (*),
          customer_profiles (*)
        )
      `)
      .order('priority', { ascending: false });

    // 根据时机过滤
    if (timing === 'today') {
      query = query.in('suggested_timing', ['今天', '今日']);
    } else if (timing === 'this_week') {
      query = query.in('suggested_timing', ['今天', '今日', '本周内']);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    console.error('Error fetching follow-up plans:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取仪表盘统计
app.get('/api/v1/follow-up-plans/stats', async (req, res) => {
  try {
    const client = getSupabaseClient();

    // 总客户数
    const { count: totalCustomers } = await client
      .from('customers')
      .select('*', { count: 'exact', head: true });

    // 今日待跟进
    const { count: todayCount } = await client
      .from('follow_up_plans')
      .select('*', { count: 'exact', head: true })
      .in('suggested_timing', ['今天', '今日']);

    // 本周待跟进
    const { count: weekCount } = await client
      .from('follow_up_plans')
      .select('*', { count: 'exact', head: true })
      .in('suggested_timing', ['今天', '今日', '本周内']);

    // 高优先级客户数
    const { count: highPriorityCount } = await client
      .from('follow_up_plans')
      .select('*', { count: 'exact', head: true })
      .gte('priority', 70);

    res.json({
      totalCustomers: totalCustomers || 0,
      todayPending: todayCount || 0,
      weekPending: weekCount || 0,
      highPriority: highPriorityCount || 0
    });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
});
