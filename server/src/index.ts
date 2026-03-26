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
        generated_messages (*)
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching customer:', error);
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

// Generate messages
app.post('/api/v1/ai/messages', async (req, res) => {
  try {
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();
    const llmClient = new LLMClient(config, customHeaders);

    const { customerId, briefId, customContext } = req.body;

    // Fetch customer data
    const supabase = getSupabaseClient();
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select(`
        *,
        ai_briefs (*)
      `)
      .eq('id', customerId)
      .maybeSingle();

    if (customerError) throw customerError;
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const latestBrief = customer.ai_briefs?.[customer.ai_briefs.length - 1];

    // Generate messages using LLM
    const prompt = `你是一个美容院客户关系管理助手。请根据以下信息生成2-3条跟进话术。

客户姓名：${customer.name}
客户简报：${latestBrief?.summary || '暂无'}
${customContext ? `额外上下文：${customContext}` : ''}

要求：
1. 话术要亲切自然，符合美容师与客户的关系
2. 每条话术要有不同的侧重点（关怀型、价值型、互动型等）
3. 长度适中，便于发送

返回JSON格式：
{
  "messages": [
    {"type": "关怀型", "content": "话术内容"},
    {"type": "价值型", "content": "话术内容"}
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

    // Save to database
    const messageInserts = generatedMessages.messages.map((msg: any) => ({
      customer_id: customerId,
      brief_id: briefId || latestBrief?.id,
      content: msg.content,
      type: msg.type,
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

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
});
