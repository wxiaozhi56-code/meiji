import { Router } from 'express';
import multer from 'multer';
import { getSupabaseClient } from '../storage/database/supabase-client';
import { authenticate, enforceDataIsolation, requireBeautician } from '../middleware/auth.middleware';
import { UserRole } from '../utils/auth.utils';
import { Config, ASRClient, LLMClient, HeaderUtils, S3Storage } from 'coze-coding-dev-sdk';

const router = Router();

// 配置 multer 用于文件上传
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 最大 10MB
  }
});

// 初始化 S3 Storage
const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

/**
 * 上传并处理音频文件
 * POST /api/v1/upload/audio
 * 
 * 流程：
 * 1. 上传音频到对象存储
 * 2. 调用 ASR 进行语音识别
 * 3. 使用 LLM 提取标签
 * 4. 保存跟进记录和标签到数据库
 */
router.post('/audio', authenticate, enforceDataIsolation, requireBeautician, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '未提供音频文件' });
    }

    const { buffer, originalname, mimetype } = req.file;
    const { customerId } = req.body;
    const { storeId, userId, role } = req.user!;

    if (!customerId) {
      return res.status(400).json({ success: false, error: '缺少客户ID' });
    }

    const client = getSupabaseClient();

    // 验证客户权限
    let customerQuery = client
      .from('customers')
      .select('id')
      .eq('id', parseInt(customerId));

    // 数据隔离：美容师只能给自己的客户录音
    if (role === UserRole.BEAUTICIAN) {
      customerQuery = customerQuery.eq('responsible_user_id', userId);
    } else {
      // 老板和店长可以给门店所有客户录音
      customerQuery = customerQuery.eq('store_id', storeId);
    }

    const { data: existingCustomer } = await customerQuery.maybeSingle();

    if (!existingCustomer) {
      return res.status(404).json({ success: false, error: '客户不存在或无权访问' });
    }

    // 1. 上传到对象存储
    const storage = getStorage();
    const fileName = `voice/${storeId}/${Date.now()}_${originalname || 'audio.m4a'}`;
    const key = await storage.uploadFile({
      fileContent: buffer,
      fileName,
      contentType: mimetype || 'audio/mp4',
    });

    // 生成签名 URL 用于 ASR
    const audioUrl = await storage.generatePresignedUrl({
      key,
      expireTime: 3600,
    });

    console.log('Audio uploaded:', audioUrl);

    // 2. 语音识别 (ASR)
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();
    const asrClient = new ASRClient(config, customHeaders);

    const asrResult = await asrClient.recognize({
      uid: String(userId),
      url: audioUrl,
    });

    console.log('ASR Result:', asrResult.text);

    // 3. 使用 LLM 提取标签
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

    // 解析标签
    let tags = [];
    try {
      tags = JSON.parse(llmResult.content);
    } catch (e) {
      console.error('Failed to parse tags:', e);
      tags = [{ tag_name: '#新跟进', category: '消费偏好' }];
    }

    // 4. 保存到数据库
    const { data: followUpRecord, error: followUpError } = await client
      .from('follow_up_records')
      .insert({
        customer_id: parseInt(customerId),
        store_id: storeId,
        user_id: userId,
        content: asrResult.text,
        audio_url: audioUrl,
      })
      .select()
      .single();

    if (followUpError) throw followUpError;

    // 保存标签
    if (tags.length > 0) {
      const tagInserts = tags.map((tag: any) => ({
        customer_id: parseInt(customerId),
        tag_name: tag.tag_name,
        category: tag.category,
      }));

      const { error: tagsError } = await client
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
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
