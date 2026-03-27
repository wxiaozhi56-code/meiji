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

// Delete follow-up record by ID
app.delete('/api/v1/follow-up-records/:id', async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { id } = req.params;

    // 先删除关联的话术和AI简报
    await client.from('generated_messages').delete().eq('follow_up_record_id', id);
    await client.from('ai_briefs').delete().eq('follow_up_record_id', id);
    
    // 再删除跟进记录
    const { error } = await client
      .from('follow_up_records')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true, message: '跟进记录已删除' });
  } catch (error: any) {
    console.error('Error deleting follow-up record:', error);
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

// Generate messages - 基于完整跟进历史生成话术
app.post('/api/v1/ai/messages', async (req, res) => {
  try {
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();
    const llmClient = new LLMClient(config, customHeaders);

    const { customerId, followUpRecordId, customContext } = req.body;

    // Fetch customer data - 获取完整历史数据
    const supabase = getSupabaseClient();
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select(`
        *,
        customer_tags (*),
        follow_up_records (*),
        ai_briefs (*),
        customer_profiles (*)
      `)
      .eq('id', customerId)
      .maybeSingle();

    if (customerError) throw customerError;
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // 1. 全部历史沟通摘要
    const allFollowUpRecords = customer.follow_up_records || [];
    const recentRecords = allFollowUpRecords.slice(-5); // 最近5条记录
    const followUpSummary = recentRecords.map((r: any) => 
      `[${r.created_at?.split('T')[0] || ''}] ${r.content?.substring(0, 50) || ''}...`
    ).join('\n');

    // 2. 所有标签
    const tags = customer.customer_tags || [];
    const tagList = tags.map((t: any) => t.tag_name).join('、') || '暂无标签';

    // 3. 客户资料（套餐、消费等）
    const profiles = customer.customer_profiles || [];
    const profileInfo = profiles.map((p: any) => `${p.field_name}: ${p.field_value}`).join('、') || '暂无';

    // 4. 最近AI简报
    const latestBrief = customer.ai_briefs?.[customer.ai_briefs.length - 1];

    // 构建完整上下文
    const prompt = `你是一个专业美容院的客户关系管理助手。请根据客户的完整历史信息，生成3条个性化的跟进话术。

## 客户基本信息
姓名：${customer.name}

## 客户标签（用于理解客户特征）
${tagList}

## 客户资料
${profileInfo}

## 历史沟通摘要（最近5条）
${followUpSummary || '暂无历史记录'}

## AI客户简报
${latestBrief?.summary || '暂无'}

## 上次跟进建议执行情况
${latestBrief?.suggestions?.map((s: any) => `${s.type}: ${s.content}`).join('；') || '暂无'}

${customContext ? `\n## 额外上下文\n${customContext}\n` : ''}

---

请根据以上完整信息，生成3条不同风格的跟进话术：

1. **关怀型**：侧重情感连接，如问候近期家庭大事、身体状况，参考家庭动态类标签
2. **价值型**：结合客户历史需求，推荐相关项目或护肤知识，参考皮肤状况、抗衰需求类标签
3. **活动型**：如有近期优惠活动，结合客户偏好进行邀约，参考消费偏好类标签

**要求：**
- 话术要亲切自然，用"姐"称呼客户
- 长度适中（30-60字），便于微信发送
- 结合客户的真实标签和历史记录，不要凭空捏造
- 避免过于推销，要自然亲切

返回JSON格式：
{
  "messages": [
    {"type": "关怀型", "content": "话术内容"},
    {"type": "价值型", "content": "话术内容"},
    {"type": "活动型", "content": "话术内容"}
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
          { type: '关怀型', content: `${customer.name}姐，最近天气变化大，记得多注意保暖哦~` },
          { type: '价值型', content: `${customer.name}姐，我们最近有新项目上线，很适合您的肤质~` },
          { type: '活动型', content: `${customer.name}姐，本周会员日有专属优惠，有空来坐坐~` }
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

/**
 * 计算单个客户的跟进优先级（2天跟进规则）
 * 规则：
 * - 所有客户默认执行"2天跟进机制"
 * - 超过2天未跟进 → 自动纳入"今日待跟进"
 * - 超过3天未跟进 → 红色紧急标记
 */
async function calculateCustomerPriority(client: any, customer: any) {
  let priority = 0; // 基础分改为0，让规则更清晰
  let suggestedAction = '微信关怀';
  let suggestedTiming = '暂无';
  let reasons: string[] = [];
  let urgencyLevel: 'red' | 'yellow' | 'green' = 'green'; // 紧急程度

  // 1. 计算距上次联系天数
  const lastRecord = customer.follow_up_records?.[customer.follow_up_records?.length - 1];
  let lastContactDays = 999;
  if (lastRecord?.created_at) {
    const lastDate = new Date(lastRecord.created_at);
    const now = new Date();
    lastContactDays = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  // 2. 核心规则：2天跟进机制
  if (lastContactDays >= 999) {
    // 从未跟进过
    priority = 90;
    suggestedTiming = '今天';
    suggestedAction = '电话联系';
    urgencyLevel = 'red';
    reasons.push('新客户从未跟进');
  } else if (lastContactDays >= 3) {
    // 超过3天未跟进 → 红色紧急
    priority = 80 + Math.min(lastContactDays - 3, 15); // 最高95分
    suggestedTiming = '今天';
    suggestedAction = lastContactDays >= 7 ? '电话联系' : '微信关怀';
    urgencyLevel = 'red';
    reasons.push(`已${lastContactDays}天未跟进，请立即联系`);
  } else if (lastContactDays >= 2) {
    // 超过2天未跟进 → 黄色标记
    priority = 70;
    suggestedTiming = '今天';
    urgencyLevel = 'yellow';
    reasons.push('超过2天未跟进，今日需联系');
  } else if (lastContactDays === 1) {
    // 昨天刚跟进
    priority = 30;
    suggestedTiming = '本周内';
    urgencyLevel = 'green';
    reasons.push('跟进状态良好');
  } else {
    // 今天刚跟进或无记录
    priority = 20;
    suggestedTiming = '暂无';
    urgencyLevel = 'green';
    reasons.push('今日已跟进');
  }

  // 3. 根据标签调整优先级
  const tags = customer.customer_tags || [];
  const tagNames = tags.map((t: any) => t.tag_name);
  
  if (tagNames.some((t: string) => t.includes('VIP'))) {
    priority += 10;
    reasons.push('VIP客户需重点关注');
  }
  if (tagNames.some((t: string) => t.includes('沉睡'))) {
    priority += 15;
    if (urgencyLevel !== 'red') urgencyLevel = 'yellow';
    reasons.push('沉睡客户需激活');
  }
  if (tagNames.some((t: string) => t.includes('高意向'))) {
    priority += 8;
    reasons.push('高意向客户');
  }
  if (tagNames.some((t: string) => t.includes('到期') || t.includes('续费'))) {
    priority += 12;
    suggestedAction = '活动邀约';
    if (urgencyLevel !== 'red') urgencyLevel = 'yellow';
    reasons.push('套餐即将到期');
  }

  // 4. 根据客户资料调整
  const profiles = customer.customer_profiles || [];
  profiles.forEach((p: any) => {
    if (p.field_name.includes('消费') || p.field_name.includes('套餐')) {
      priority += 5;
    }
  });

  // 5. 限制优先级范围
  priority = Math.max(0, Math.min(100, priority));

  // 6. 生成原因描述
  let reason = reasons.join('；') || '建议定期跟进维护关系';

  return {
    priority,
    suggestedAction,
    suggestedTiming,
    reason,
    lastContactDays,
    urgencyLevel // 新增：紧急程度标识
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
          urgency_level: priorityData.urgencyLevel, // 新增紧急程度
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

    // 紧急待跟进（红色 - 超过3天）
    const { count: urgentCount } = await client
      .from('follow_up_plans')
      .select('*', { count: 'exact', head: true })
      .eq('urgency_level', 'red');

    // 今日待跟进（黄色 - 超过2天）
    const { count: todayCount } = await client
      .from('follow_up_plans')
      .select('*', { count: 'exact', head: true })
      .eq('urgency_level', 'yellow');

    // 本周待跟进
    const { count: weekCount } = await client
      .from('follow_up_plans')
      .select('*', { count: 'exact', head: true })
      .in('urgency_level', ['red', 'yellow']);

    // 正常跟进（绿色）
    const { count: normalCount } = await client
      .from('follow_up_plans')
      .select('*', { count: 'exact', head: true })
      .eq('urgency_level', 'green');

    res.json({
      totalCustomers: totalCustomers || 0,
      todayPending: (urgentCount || 0) + (todayCount || 0), // 今日待跟进 = 紧急 + 即将逾期
      weekPending: weekCount || 0,
      highPriority: urgentCount || 0, // 高优先级 = 紧急
      urgentCount: urgentCount || 0, // 紧急（红色）
      pendingCount: todayCount || 0, // 待跟进（黄色）
      normalCount: normalCount || 0, // 正常（绿色）
    });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// 标记客户已互动（重置2天计时器）
app.post('/api/v1/customers/:id/interact', async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { id } = req.params;
    const { interactionType = '微信关怀', notes = '' } = req.body;

    // 添加一条跟进记录，重置计时器
    const { data: record, error: recordError } = await client
      .from('follow_up_records')
      .insert({
        customer_id: parseInt(id),
        content: notes || `${interactionType} - 客户已互动标记`,
        interaction_type: interactionType,
      })
      .select()
      .single();

    if (recordError) throw recordError;

    // 重新计算该客户的跟进优先级
    const { data: customer } = await client
      .from('customers')
      .select(`
        *,
        customer_tags (*),
        customer_profiles (*),
        follow_up_records (*)
      `)
      .eq('id', id)
      .maybeSingle();

    if (customer) {
      const priorityData = await calculateCustomerPriority(client, customer);
      
      await client
        .from('follow_up_plans')
        .upsert({
          customer_id: customer.id,
          priority: priorityData.priority,
          suggested_action: priorityData.suggestedAction,
          suggested_timing: priorityData.suggestedTiming,
          reason: priorityData.reason,
          last_contact_days: priorityData.lastContactDays,
          urgency_level: priorityData.urgencyLevel,
          calculated_at: new Date().toISOString(),
        }, {
          onConflict: 'customer_id'
        });
    }

    res.json({ 
      success: true, 
      message: '已标记客户互动，跟进计时器已重置',
      record 
    });
  } catch (error: any) {
    console.error('Error marking customer interaction:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== 客户360°深度分析 API ====================

/**
 * 生成客户深度分析报告
 * 整合所有历史数据，通过AI生成多维度分析
 */
app.post('/api/v1/analysis/generate', async (req, res) => {
  try {
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();
    const llmClient = new LLMClient(config, customHeaders);

    const { customerId } = req.body;
    const client = getSupabaseClient();

    // 1. 获取客户完整数据
    const { data: customer, error: customerError } = await client
      .from('customers')
      .select(`
        *,
        customer_tags (*),
        customer_profiles (*),
        follow_up_records (*),
        ai_briefs (*),
        generated_messages (*)
      `)
      .eq('id', customerId)
      .maybeSingle();

    if (customerError) throw customerError;
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // 2. 整合数据
    const tags = customer.customer_tags || [];
    const profiles = customer.customer_profiles || [];
    const followUpRecords = customer.follow_up_records || [];
    const aiBriefs = customer.ai_briefs || [];

    // 3. 构建分析Prompt
    const prompt = `你是一个专业的美容院客户关系管理分析师。请根据以下客户数据，生成一份详细的360°深度分析报告。

## 客户基本信息
- 姓名：${customer.name}
- 电话：${customer.phone || '未记录'}

## 标签库（所有历史标签）
${tags.map((t: any) => `- ${t.tag_name}（${t.category}）`).join('\n') || '暂无标签'}

## 客户资料
${profiles.map((p: any) => `- ${p.field_name}: ${p.field_value}`).join('\n') || '暂无资料'}

## 跟进历史（最近10条）
${followUpRecords.slice(-10).map((r: any) => 
  `- [${r.created_at?.split('T')[0] || ''}] ${r.content?.substring(0, 100) || ''}`
).join('\n') || '暂无跟进记录'}

## AI简报历史
${aiBriefs.slice(-3).map((b: any) => 
  `- ${b.summary}`
).join('\n') || '暂无AI简报'}

---

请生成一份结构化的JSON分析报告，包含以下维度：

\`\`\`json
{
  "customerValue": {
    "consumptionRating": 4,
    "consumptionPotential": "high",
    "lifecycleStage": "growing",
    "ltvEstimate": 12000,
    "ltvEstimateReason": "基于消费频次和客单价预测"
  },
  "statusAnalysis": {
    "emotionalState": "焦虑（因女儿升学压力）",
    "skinCondition": "脸颊干、法令纹明显",
    "lifeEvents": "女儿刚考上大学",
    "visitFrequency": "normal",
    "churnRisk": "medium"
  },
  "coreNeeds": {
    "topNeeds": ["法令纹改善", "抗衰", "补水"],
    "unmetNeeds": ["失眠导致的皮肤问题"],
    "interests": ["射频类仪器", "深层补水项目"]
  },
  "followUpStrategy": {
    "bestTiming": "今天（距上次到店已超2周）",
    "bestChannel": "微信私聊",
    "suggestedStaff": "小李",
    "communicationStyle": "关怀型"
  },
  "salesRecommendation": {
    "primaryRecommendation": "补水+射频抗衰套餐",
    "secondaryRecommendation": "助眠精油护理",
    "avoidItems": ["酸类焕肤（客户反馈刺激）"],
    "pitchAngle": "姐，恭喜宝贝考上大学！最近操心又失眠，皮肤容易干...",
    "discountStrategy": "适合推套餐，不适合直接推高价单品"
  },
  "riskWarning": {
    "churnAlert": "最近到店间隔较长，建议跟进",
    "complaintAlert": null,
    "priceSensitivity": "medium"
  },
  "fullReportMarkdown": "完整的Markdown格式报告文本"
}
\`\`\`

**评分标准说明：**
- consumptionRating: 1-5星，基于消费总额、客单价、频率综合评定
- consumptionPotential: high/medium/low
- lifecycleStage: new/growing/mature/dormant/churned
- visitFrequency: high/normal/low/dormant
- churnRisk: high/medium/low
- priceSensitivity: high/medium/low

**重要：** 
1. 分析要基于提供的真实数据，不要凭空捏造
2. fullReportMarkdown需要生成完整的、格式化的Markdown报告
3. 只返回JSON，不要其他内容`;

    const messages = [{ role: 'user' as const, content: prompt }];
    const llmResult = await llmClient.invoke(messages, { temperature: 0.7 });

    // 4. 解析AI结果 - 智能提取JSON
    let analysis;
    try {
      let jsonContent = llmResult.content;
      
      // 方法1: 尝试直接解析
      try {
        analysis = JSON.parse(jsonContent);
      } catch (e1) {
        // 方法2: 去除Markdown代码块后解析
        let cleaned = jsonContent;
        if (cleaned.includes('```json')) {
          cleaned = cleaned.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        } else if (cleaned.includes('```')) {
          cleaned = cleaned.replace(/```\s*/g, '');
        }
        cleaned = cleaned.trim();
        
        try {
          analysis = JSON.parse(cleaned);
        } catch (e2) {
          // 方法3: 提取第一个完整的JSON对象
          const jsonStart = cleaned.indexOf('{');
          if (jsonStart !== -1) {
            // 使用栈匹配找到完整的JSON对象
            let depth = 0;
            let jsonEnd = jsonStart;
            for (let i = jsonStart; i < cleaned.length; i++) {
              if (cleaned[i] === '{') depth++;
              else if (cleaned[i] === '}') depth--;
              if (depth === 0) {
                jsonEnd = i + 1;
                break;
              }
            }
            const extractedJson = cleaned.substring(jsonStart, jsonEnd);
            console.log('Extracted JSON (last 200 chars):', extractedJson.substring(extractedJson.length - 200));
            analysis = JSON.parse(extractedJson);
          } else {
            throw new Error('No JSON object found');
          }
        }
      }
      
      console.log('Successfully parsed LLM analysis');
    } catch (e) {
      console.error('Failed to parse analysis:', e);
      console.error('LLM Raw Response (first 1500 chars):', llmResult.content.substring(0, 1500));
      
      // 返回默认分析结构 - 基于客户实际标签生成
      const tagNames = tags.map((t: any) => t.tag_name);
      
      // 从标签中提取健康相关需求
      const healthNeeds = tagNames.filter((t: string) => 
        t.includes('疼痛') || t.includes('不适') || t.includes('失眠') || t.includes('护理需求')
      );
      const skinNeeds = tagNames.filter((t: string) => 
        t.includes('皮肤') || t.includes('干燥') || t.includes('补水')
      );
      
      analysis = {
        customerValue: {
          consumptionRating: tagNames.includes('#VIP客户') ? 4 : 3,
          consumptionPotential: tagNames.includes('#VIP客户') ? 'high' : 'medium',
          lifecycleStage: 'growing',
          ltvEstimate: tagNames.includes('#VIP客户') ? 15000 : 8000,
          ltvEstimateReason: '基于客户标签和历史数据分析'
        },
        statusAnalysis: {
          emotionalState: tagNames.includes('#失眠') ? '可能存在睡眠焦虑，建议关注休息质量' : '暂无足够数据判断',
          skinCondition: skinNeeds.length > 0 ? skinNeeds.join('、') : '暂无数据',
          lifeEvents: tagNames.filter((t: string) => 
            t.includes('子女') || t.includes('中考') || t.includes('出行') || t.includes('家庭')
          ).join('、') || '',
          visitFrequency: 'normal',
          churnRisk: 'low'
        },
        coreNeeds: {
          topNeeds: [...healthNeeds, ...skinNeeds].slice(0, 3),
          unmetNeeds: healthNeeds.filter((t: string) => t.includes('疼痛') || t.includes('不适')),
          interests: []
        },
        followUpStrategy: {
          bestTiming: '本周内',
          bestChannel: '微信关怀',
          suggestedStaff: '指定美容师',
          communicationStyle: '关怀型'
        },
        salesRecommendation: {
          primaryRecommendation: healthNeeds.length > 0 ? '身体舒缓护理' : '基础补水护理',
          secondaryRecommendation: skinNeeds.length > 0 ? '深层补水护理' : '',
          avoidItems: [],
          pitchAngle: healthNeeds.length > 0 
            ? '姐，最近背部不舒服的话，可以来做个舒缓护理放松一下~' 
            : '姐，最近有空来做一次护理吗？',
          discountStrategy: '适合推荐体验套餐'
        },
        riskWarning: {
          churnAlert: null,
          complaintAlert: null,
          priceSensitivity: 'medium'
        },
        fullReportMarkdown: `# 客户深度分析报告\n\n## 客户：${customer.name}\n\n### 客户价值评估\n- 消费能力：${tagNames.includes('#VIP客户') ? '⭐⭐⭐⭐' : '⭐⭐⭐'}\n- 消费潜力：${tagNames.includes('#VIP客户') ? '高' : '中等'}\n\n### 近况与状态\n- 情绪状态：${tagNames.includes('#失眠') ? '可能存在睡眠焦虑' : '暂无数据'}\n- 皮肤状态：${skinNeeds.length > 0 ? skinNeeds.join('、') : '暂无数据'}\n- 生活动态：${tagNames.filter((t: string) => t.includes('子女') || t.includes('中考') || t.includes('出行')).join('、') || '暂无数据'}\n\n### 核心需求\n${[...healthNeeds, ...skinNeeds].map((n, i) => `${i + 1}. ${n}`).join('\n') || '暂无明确需求'}\n\n### 推荐项目\n- 首选：${healthNeeds.length > 0 ? '身体舒缓护理' : '基础补水护理'}\n${skinNeeds.length > 0 ? `- 次选：深层补水护理` : ''}`
      };
    }

    // 5. 保存到数据库（先删除旧报告）
    await client
      .from('customer_analysis_reports')
      .delete()
      .eq('customer_id', customerId);

    const { data: savedReport, error: saveError } = await client
      .from('customer_analysis_reports')
      .insert({
        customer_id: customerId,
        consumption_rating: analysis.customerValue?.consumptionRating || 3,
        consumption_potential: analysis.customerValue?.consumptionPotential || 'medium',
        lifecycle_stage: analysis.customerValue?.lifecycleStage || 'new',
        ltv_estimate: analysis.customerValue?.ltvEstimate || 0,
        emotional_state: analysis.statusAnalysis?.emotionalState,
        skin_condition: analysis.statusAnalysis?.skinCondition,
        life_events: analysis.statusAnalysis?.lifeEvents,
        visit_frequency: analysis.statusAnalysis?.visitFrequency || 'normal',
        churn_risk: analysis.statusAnalysis?.churnRisk || 'low',
        top_needs: JSON.stringify(analysis.coreNeeds?.topNeeds || []),
        unmet_needs: JSON.stringify(analysis.coreNeeds?.unmetNeeds || []),
        interests: JSON.stringify(analysis.coreNeeds?.interests || []),
        best_timing: analysis.followUpStrategy?.bestTiming,
        best_channel: analysis.followUpStrategy?.bestChannel,
        suggested_staff: analysis.followUpStrategy?.suggestedStaff,
        communication_style: analysis.followUpStrategy?.communicationStyle,
        primary_recommendation: analysis.salesRecommendation?.primaryRecommendation,
        secondary_recommendation: analysis.salesRecommendation?.secondaryRecommendation,
        avoid_items: JSON.stringify(analysis.salesRecommendation?.avoidItems || []),
        pitch_angle: analysis.salesRecommendation?.pitchAngle,
        discount_strategy: analysis.salesRecommendation?.discountStrategy,
        churn_alert: analysis.riskWarning?.churnAlert,
        complaint_alert: analysis.riskWarning?.complaintAlert,
        price_sensitivity: analysis.riskWarning?.priceSensitivity || 'medium',
        full_report: analysis.fullReportMarkdown,
      })
      .select()
      .single();

    if (saveError) throw saveError;

    res.json({
      success: true,
      report: savedReport,
      analysis: analysis
    });
  } catch (error: any) {
    console.error('Error generating analysis:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取客户深度分析报告
 */
app.get('/api/v1/analysis/:customerId', async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { customerId } = req.params;

    const { data: report, error } = await client
      .from('customer_analysis_reports')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!report) {
      return res.json({ 
        success: false, 
        message: '暂无分析报告，请先生成' 
      });
    }

    // 检查是否过期
    const expiresAt = new Date(report.expires_at);
    const isExpired = expiresAt < new Date();

    res.json({
      success: true,
      report,
      isExpired
    });
  } catch (error: any) {
    console.error('Error fetching analysis:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
});
