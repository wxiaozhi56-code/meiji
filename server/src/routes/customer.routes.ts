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
 * Query 参数：filter - 'active'(活跃) | 'sleeping'(沉睡) | 'pending'(待跟进)
 */
router.get('/', authenticate, enforceDataIsolation, requireBeautician, async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { storeId, userId, role } = req.user!;
    const { filter } = req.query; // 筛选条件

    // 如果是筛选查询，使用不同的逻辑
    if (filter && ['active', 'sleeping', 'pending'].includes(filter as string)) {
      return await handleFilterQuery(client, storeId, userId, role, filter as string, res);
    }

    // 普通查询
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
        customer_profiles (*),
        responsible_user:users!customers_responsible_user_id_fkey (id, name, phone)
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

    // 计算最后跟进时间
    let lastFollowUpAt = null;
    if (data.follow_up_records && data.follow_up_records.length > 0) {
      // 按时间排序，取最新的
      const sortedRecords = [...data.follow_up_records].sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      lastFollowUpAt = sortedRecords[0].created_at;
    }

    // 添加最后跟进时间到返回数据
    const resultData = {
      ...data,
      last_follow_up_at: lastFollowUpAt,
    };

    // 过滤掉过期的智能话术
    if (resultData.generated_messages && resultData.generated_messages.length > 0) {
      const now = new Date();
      resultData.generated_messages = resultData.generated_messages.filter(
        (msg: any) => !msg.expires_at || new Date(msg.expires_at) > now
      );
    }

    res.json({
      success: true,
      data: resultData,
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

/**
 * 处理筛选查询
 * @param filter - 'active'(活跃) | 'sleeping'(沉睡) | 'pending'(待跟进)
 */
async function handleFilterQuery(
  client: any,
  storeId: number,
  userId: number,
  role: string,
  filter: string,
  res: any
) {
  const now = new Date();
  
  // 构建基础客户查询
  let baseQuery = client
    .from('customers')
    .select('id, name, phone, created_at, responsible_user_id')
    .eq('store_id', storeId);

  // 数据隔离：美容师只能看自己的客户
  if (role === UserRole.BEAUTICIAN) {
    baseQuery = baseQuery.eq('responsible_user_id', userId);
  }

  const { data: allCustomers, error: customersError } = await baseQuery;

  if (customersError) throw customersError;

  if (!allCustomers || allCustomers.length === 0) {
    return res.json({ success: true, data: [] });
  }

  const customerIds = allCustomers.map((c: any) => c.id);
  const result: any[] = [];

  if (filter === 'active') {
    // 活跃客户：近30天有跟进记录
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const { data: recentRecords } = await client
      .from('follow_up_records')
      .select('customer_id')
      .in('customer_id', customerIds)
      .gte('created_at', thirtyDaysAgo.toISOString());

    const activeCustomerIds = new Set(recentRecords?.map((r: any) => r.customer_id) || []);

    for (const customer of allCustomers) {
      if (activeCustomerIds.has(customer.id)) {
        // 获取完整客户信息
        const { data: fullCustomer } = await client
          .from('customers')
          .select(`*, customer_tags (*), customer_profiles (*)`)
          .eq('id', customer.id)
          .single();
        if (fullCustomer) result.push(fullCustomer);
      }
    }
  } else if (filter === 'sleeping') {
    // 沉睡客户：超过60天无跟进记录
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    
    const { data: recentRecords } = await client
      .from('follow_up_records')
      .select('customer_id, created_at')
      .in('customer_id', customerIds)
      .order('created_at', { ascending: false });

    // 找出每个客户最近的跟进时间
    const lastFollowUpMap = new Map<number, Date>();
    for (const record of recentRecords || []) {
      if (!lastFollowUpMap.has(record.customer_id)) {
        lastFollowUpMap.set(record.customer_id, new Date(record.created_at));
      }
    }

    for (const customer of allCustomers) {
      const lastFollowUp = lastFollowUpMap.get(customer.id);
      if (!lastFollowUp || lastFollowUp < sixtyDaysAgo) {
        // 获取完整客户信息
        const { data: fullCustomer } = await client
          .from('customers')
          .select(`*, customer_tags (*), customer_profiles (*)`)
          .eq('id', customer.id)
          .single();
        if (fullCustomer) result.push(fullCustomer);
      }
    }
  } else if (filter === 'pending') {
    // 待跟进客户：有跟进计划但未完成
    const { data: pendingPlans } = await client
      .from('follow_up_plans')
      .select('customer_id')
      .in('customer_id', customerIds)
      .in('suggested_timing', ['今天', '今日', '本周内']);

    const pendingCustomerIds = new Set(pendingPlans?.map((p: any) => p.customer_id) || []);

    for (const customer of allCustomers) {
      if (pendingCustomerIds.has(customer.id)) {
        // 获取完整客户信息
        const { data: fullCustomer } = await client
          .from('customers')
          .select(`*, customer_tags (*), customer_profiles (*)`)
          .eq('id', customer.id)
          .single();
        if (fullCustomer) result.push(fullCustomer);
      }
    }
  }

  res.json({ success: true, data: result });
}

/**
 * 添加客户标签
 * POST /api/v1/customers/:id/tags
 */
router.post('/:id/tags', authenticate, enforceDataIsolation, requireBeautician, async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { id } = req.params;
    const { tagName, category } = req.body;
    const { storeId, userId, role } = req.user!;

    if (!tagName || !tagName.trim()) {
      return res.status(400).json({ success: false, error: '标签名称不能为空' });
    }

    // 验证客户权限
    let query = client.from('customers').select('id').eq('id', id);
    if (role === UserRole.BEAUTICIAN) {
      query = query.eq('responsible_user_id', userId);
    } else {
      query = query.eq('store_id', storeId);
    }

    const { data: existingCustomer } = await query.maybeSingle();
    if (!existingCustomer) {
      return res.status(404).json({ success: false, error: '客户不存在或无权访问' });
    }

    // 检查标签是否已存在
    const { data: existingTag } = await client
      .from('customer_tags')
      .select('id')
      .eq('customer_id', id)
      .eq('tag_name', tagName.trim())
      .maybeSingle();

    if (existingTag) {
      return res.status(400).json({ success: false, error: '该标签已存在' });
    }

    // 添加标签
    const { data: newTag, error } = await client
      .from('customer_tags')
      .insert({
        customer_id: parseInt(id),
        tag_name: tagName.trim(),
        category: category || '自定义标签',
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: '标签已添加',
      data: newTag,
    });
  } catch (error: any) {
    console.error('Error adding tag:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除客户标签
 * DELETE /api/v1/customers/:customerId/tags/:tagId
 */
router.delete('/:customerId/tags/:tagId', authenticate, enforceDataIsolation, requireBeautician, async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { customerId, tagId } = req.params;
    const { storeId, userId, role } = req.user!;

    // 验证客户权限
    let query = client.from('customers').select('id').eq('id', customerId);
    if (role === UserRole.BEAUTICIAN) {
      query = query.eq('responsible_user_id', userId);
    } else {
      query = query.eq('store_id', storeId);
    }

    const { data: existingCustomer } = await query.maybeSingle();
    if (!existingCustomer) {
      return res.status(404).json({ success: false, error: '客户不存在或无权访问' });
    }

    // 删除标签
    const { error } = await client
      .from('customer_tags')
      .delete()
      .eq('id', tagId)
      .eq('customer_id', customerId);

    if (error) throw error;

    res.json({
      success: true,
      message: '标签已删除',
    });
  } catch (error: any) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取常用标签建议
 * GET /api/v1/customers/tag-suggestions
 */
router.get('/tag-suggestions', authenticate, enforceDataIsolation, async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { storeId } = req.user!;

    // 获取门店常用标签（按使用次数排序）
    const { data: tags, error } = await client
      .from('customer_tags')
      .select('tag_name, category')
      .eq('store_id', storeId)
      .order('tag_name');

    if (error) throw error;

    // 统计标签使用次数
    const tagCount: Record<string, { name: string; category: string; count: number }> = {};
    for (const tag of tags || []) {
      const key = tag.tag_name;
      if (tagCount[key]) {
        tagCount[key].count++;
      } else {
        tagCount[key] = { name: tag.tag_name, category: tag.category || '其他', count: 1 };
      }
    }

    // 按使用次数排序并返回前20个
    const suggestions = Object.values(tagCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // 预设标签
    const presetTags = [
      { name: 'VIP', category: '客户等级' },
      { name: '新客', category: '生命周期' },
      { name: '老客', category: '生命周期' },
      { name: '沉睡', category: '生命周期' },
      { name: '抗衰', category: '消费偏好' },
      { name: '补水', category: '消费偏好' },
      { name: '美白', category: '消费偏好' },
      { name: '祛痘', category: '消费偏好' },
    ];

    res.json({
      success: true,
      data: {
        suggestions,
        presetTags,
      },
    });
  } catch (error: any) {
    console.error('Error fetching tag suggestions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
