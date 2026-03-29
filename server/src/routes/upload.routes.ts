import { Router } from 'express';
import multer from 'multer';
import { getSupabaseClient } from '../storage/database/supabase-client';
import { authenticate, enforceDataIsolation, requireBeautician } from '../middleware/auth.middleware';
import { UserRole } from '../utils/auth.utils';

const router = Router();

// 配置 multer 用于文件上传
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 最大 10MB
  }
});

/**
 * 上传音频文件（简化版本）
 * POST /api/v1/upload/audio
 * 
 * 暂时不支持语音识别，只保存音频记录
 */
router.post('/audio', authenticate, enforceDataIsolation, requireBeautician, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '未提供音频文件' });
    }

    const { customerId, content } = req.body;
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

    // 保存跟进记录（暂时不处理音频，只保存文字内容）
    const { data: followUpRecord, error: followUpError } = await client
      .from('follow_up_records')
      .insert({
        customer_id: parseInt(customerId),
        store_id: storeId,
        user_id: userId,
        content: content || '语音记录（暂不支持识别）',
      })
      .select()
      .single();

    if (followUpError) throw followUpError;

    res.json({
      success: true,
      message: '音频已上传（语音识别功能暂不可用）',
      followUpRecord,
    });
  } catch (error: any) {
    console.error('Error processing audio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
