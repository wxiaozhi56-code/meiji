import { Router } from 'express';
import { getSupabaseClient } from '../storage/database/supabase-client';
import { authenticate, enforceDataIsolation, requireBeautician } from '../middleware/auth.middleware';
import { UserRole } from '../utils/auth.utils';

const router = Router();

/**
 * 创建客户
 * POST /api/v1/customers
 */
router.post('/', authenticate, enforceDataIsolation, requireBeautician, async (req, res) => {
  try {
    const { name, phone, notes } = req.body;
    const { storeId, userId, role } = req.user!;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: '客户姓名不能为空' });
    }

    const client = getSupabaseClient();

    // 创建客户，自动注入store_id和responsible_user_id
    const customerData: any = {
      name: name.trim(),
      phone: phone?.trim() || null,
      store_id: storeId,
      responsible_user_id: userId, // 默认创建者负责
    };

    const { data: customer, error: customerError } = await client
      .from('customers')
      .insert(customerData)
      .select()
      .single();

    if (customerError) throw customerError;

    // 如果有备注，提取标签并保存
    if (notes && notes.trim()) {
      // 提取标签
      const tagMatches = notes.match(/#[\u4e00-\u9fa5a-zA-Z0-9]+/g);
      if (tagMatches && tagMatches.length > 0) {
        const tagInserts = tagMatches.map((tag: string) => ({
          customer_id: customer.id,
          tag_name: tag,
          category: '消费偏好',
        }));
        await client.from('customer_tags').insert(tagInserts);
      }

      // 保存为跟进记录
      await client.from('follow_up_records').insert({
        customer_id: customer.id,
        store_id: storeId,
        user_id: userId,
        content: notes.trim(),
      });
    }

    // 获取完整客户数据
    const { data: fullCustomer, error: fetchError } = await client
      .from('customers')
      .select(`*, customer_tags (*)`)
      .eq('id', customer.id)
      .single();

    if (fetchError) throw fetchError;

    res.status(201).json({
      success: true,
      data: fullCustomer,
    });
  } catch (error: any) {
    console.error('Error creating customer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取客户列表
 * GET /api/v1/customers
 */
router.get('/', authenticate, enforceDataIsolation, requireBeautician, async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { storeId, userId, role } = req.user!;

    let query = client
      .from('customers')
      .select(`
        *,
        customer_tags (*),
        customer_profiles (*)
      `);

    // 数据隔离：美容师只能看自己的客户
    if (role === UserRole.BEAUTICIAN) {
      query = query.eq('responsible_user_id', userId);
    } else {
      // 老板和店长可以看门店所有客户
      query = query.eq('store_id', storeId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
    });
  } catch (error: any) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取客户详情
 * GET /api/v1/customers/:id
 */
router.get('/:id', authenticate, enforceDataIsolation, requireBeautician, async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { id } = req.params;
    const { storeId, userId, role } = req.user!;

    let query = client
      .from('customers')
      .select(`
        *,
        customer_tags (*),
        follow_up_records (*),
        ai_briefs (*),
        generated_messages (*),
        customer_profiles (*)
      `)
      .eq('id', id);

    // 数据隔离：美容师只能看自己的客户
    if (role === UserRole.BEAUTICIAN) {
      query = query.eq('responsible_user_id', userId);
    } else {
      // 老板和店长可以看门店所有客户
      query = query.eq('store_id', storeId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ success: false, error: '客户不存在或无权访问' });
    }

    // 过滤掉过期的智能话术
    if (data.generated_messages && data.generated_messages.length > 0) {
      const now = new Date();
      data.generated_messages = data.generated_messages.filter(
        (msg: any) => !msg.expires_at || new Date(msg.expires_at) > now
      );
    }

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Error fetching customer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除客户
 * DELETE /api/v1/customers/:id
 */
router.delete('/:id', authenticate, enforceDataIsolation, requireBeautician, async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { id } = req.params;
    const { storeId, userId, role } = req.user!;

    // 验证权限
    let query = client
      .from('customers')
      .select('id')
      .eq('id', id);

    // 数据隔离
    if (role === UserRole.BEAUTICIAN) {
      query = query.eq('responsible_user_id', userId);
    } else {
      query = query.eq('store_id', storeId);
    }

    const { data: existingCustomer } = await query.maybeSingle();

    if (!existingCustomer) {
      return res.status(404).json({ success: false, error: '客户不存在或无权删除' });
    }

    // 删除客户
    const { error } = await client
      .from('customers')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: '客户已删除',
    });
  } catch (error: any) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 标记客户互动
 * POST /api/v1/customers/:id/interact
 */
router.post('/:id/interact', authenticate, enforceDataIsolation, requireBeautician, async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { id } = req.params;
    const { interactionType, notes } = req.body;
    const { storeId, userId, role } = req.user!;

    // 验证权限
    let query = client
      .from('customers')
      .select('id')
      .eq('id', id);

    // 数据隔离
    if (role === UserRole.BEAUTICIAN) {
      query = query.eq('responsible_user_id', userId);
    } else {
      query = query.eq('store_id', storeId);
    }

    const { data: existingCustomer } = await query.maybeSingle();

    if (!existingCustomer) {
      return res.status(404).json({ success: false, error: '客户不存在或无权访问' });
    }

    // 更新最后互动时间
    await client
      .from('customers')
      .update({ last_interaction_at: new Date().toISOString() })
      .eq('id', id);

    // 创建跟进记录
    await client.from('follow_up_records').insert({
      customer_id: parseInt(id),
      store_id: storeId,
      user_id: userId,
      content: `${interactionType || '互动'} - 客户已互动标记`,
      interaction_type: interactionType,
    });

    res.json({
      success: true,
      message: '互动已记录',
    });
  } catch (error: any) {
    console.error('Error marking interaction:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
