import { Router } from 'express';
import { getSupabaseClient } from '../storage/database/supabase-client';
import { authenticate, enforceDataIsolation } from '../middleware/auth.middleware';

const router = Router();

/**
 * AI 分析接口（简化版本）
 * 暂时返回模拟数据
 */

// 生成 AI 简报
router.post('/brief', authenticate, enforceDataIsolation, async (req, res) => {
  try {
    const { customerId } = req.body;

    if (!customerId) {
      return res.status(400).json({ success: false, error: '缺少客户ID' });
    }

    const client = getSupabaseClient();

    // 获取客户信息
    const { data: customer, error } = await client
      .from('customers')
      .select(`
        *,
        customer_tags (*),
        follow_up_records (*)
      `)
      .eq('id', customerId)
      .maybeSingle();

    if (error || !customer) {
      return res.status(404).json({ success: false, error: '客户不存在' });
    }

    // 保存简报到数据库
    const { data: savedBrief, error: briefError } = await client
      .from('ai_briefs')
      .insert({
        customer_id: customerId,
        summary: 'AI分析功能暂时不可用',
        suggestions: [
          { type: '建议', content: '请稍后再试' }
        ],
      })
      .select()
      .single();

    if (briefError) throw briefError;

    res.json(savedBrief);
  } catch (error: any) {
    console.error('Error generating brief:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 生成智能话术
router.post('/messages', authenticate, enforceDataIsolation, async (req, res) => {
  try {
    const { customerId } = req.body;

    if (!customerId) {
      return res.status(400).json({ success: false, error: '缺少客户ID' });
    }

    const client = getSupabaseClient();

    // 获取客户信息
    const { data: customer, error } = await client
      .from('customers')
      .select('name')
      .eq('id', customerId)
      .maybeSingle();

    if (error || !customer) {
      return res.status(404).json({ success: false, error: '客户不存在' });
    }

    // 删除旧话术
    await client
      .from('generated_messages')
      .delete()
      .eq('customer_id', customerId);

    // 保存新话术
    const messageInserts = [
      { customer_id: customerId, type: '关怀型', content: `${customer.name}姐，最近天气变化大，记得多注意保暖哦~` },
      { customer_id: customerId, type: '价值型', content: `${customer.name}姐，我们最近有新项目上线，很适合您的肤质~` },
      { customer_id: customerId, type: '活动型', content: `${customer.name}姐，本周会员日有专属优惠，有空来坐坐~` }
    ];

    const { data: savedMessages, error: messagesError } = await client
      .from('generated_messages')
      .insert(messageInserts)
      .select();

    if (messagesError) throw messagesError;

    res.json(savedMessages);
  } catch (error: any) {
    console.error('Error generating messages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
