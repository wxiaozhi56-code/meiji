import { Router } from 'express';
import { getSupabaseClient } from '../storage/database/supabase-client';
import { authenticate, enforceDataIsolation, requireStoreOwner } from '../middleware/auth.middleware';
import { hashPassword, comparePassword } from '../utils/auth.utils';

const router = Router();

/**
 * 获取门店信息
 * GET /api/v1/stores/me
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { storeId } = req.user!;

    if (!storeId) {
      return res.status(400).json({ 
        success: false,
        error: '您没有绑定门店' 
      });
    }

    const { data: store, error } = await client
      .from('stores')
      .select('*')
      .eq('id', storeId)
      .single();

    if (error || !store) {
      return res.status(404).json({ 
        success: false,
        error: '门店不存在' 
      });
    }

    res.json({
      success: true,
      data: store,
    });
  } catch (error: any) {
    console.error('Error fetching store:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 更新门店信息
 * PUT /api/v1/stores/me
 */
router.put('/me', authenticate, requireStoreOwner, async (req, res) => {
  try {
    const { name, address, logoUrl } = req.body;
    const { storeId } = req.user!;

    if (!storeId) {
      return res.status(400).json({ 
        success: false,
        error: '您没有绑定门店' 
      });
    }

    const client = getSupabaseClient();

    // 构建更新数据
    const updateData: any = {};
    if (name) updateData.name = name;
    if (address !== undefined) updateData.address = address;
    if (logoUrl !== undefined) updateData.logo_url = logoUrl;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ 
        success: false,
        error: '没有要更新的内容' 
      });
    }

    const { data: store, error } = await client
      .from('stores')
      .update(updateData)
      .eq('id', storeId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: '门店信息已更新',
      data: store,
    });
  } catch (error: any) {
    console.error('Error updating store:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 分配客户给美容师
 * PUT /api/v1/stores/customers/:customerId/assign
 */
router.put('/customers/:customerId/assign', authenticate, enforceDataIsolation, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { responsibleUserId } = req.body;
    const { storeId, userId, role } = req.user!;

    // 只有老板和店长可以分配客户
    if (role !== 'store_owner' && role !== 'store_manager') {
      return res.status(403).json({ 
        success: false,
        error: '只有老板和店长可以分配客户' 
      });
    }

    if (!responsibleUserId) {
      return res.status(400).json({ 
        success: false,
        error: '请选择要分配的美容师' 
      });
    }

    const client = getSupabaseClient();

    // 验证客户属于当前门店
    const { data: customer } = await client
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!customer) {
      return res.status(404).json({ 
        success: false,
        error: '客户不存在' 
      });
    }

    // 验证目标用户属于当前门店
    const { data: targetUser } = await client
      .from('users')
      .select('id, name')
      .eq('id', responsibleUserId)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!targetUser) {
      return res.status(400).json({ 
        success: false,
        error: '目标用户不存在或不属于当前门店' 
      });
    }

    // 更新客户负责人
    const { error } = await client
      .from('customers')
      .update({ responsible_user_id: responsibleUserId })
      .eq('id', customerId);

    if (error) throw error;

    res.json({
      success: true,
      message: `客户已分配给 ${targetUser.name}`,
    });
  } catch (error: any) {
    console.error('Error assigning customer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取门店员工列表（用于分配客户）
 * GET /api/v1/stores/employees
 */
router.get('/employees', authenticate, enforceDataIsolation, async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { storeId } = req.user!;

    const { data: employees, error } = await client
      .from('users')
      .select('id, name, phone, role')
      .eq('store_id', storeId)
      .eq('status', 'active')
      .in('role', ['store_owner', 'store_manager', 'beautician'])
      .order('role', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      data: employees,
    });
  } catch (error: any) {
    console.error('Error fetching store employees:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取门店统计数据
 * GET /api/v1/stores/statistics
 */
router.get('/statistics', authenticate, enforceDataIsolation, async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { storeId } = req.user!;

    // 获取客户总数
    const { count: totalCustomers } = await client
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId);

    // 获取本月新增客户
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    const { count: newCustomersThisMonth } = await client
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .gte('created_at', firstDayOfMonth.toISOString());

    // 获取活跃客户（30天内有跟进）
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: activeCustomerIds } = await client
      .from('follow_up_records')
      .select('customer_id')
      .eq('store_id', storeId)
      .gte('created_at', thirtyDaysAgo.toISOString());

    const activeCustomers = new Set(activeCustomerIds?.map(r => r.customer_id) || []).size;

    // 获取沉睡客户（60天无跟进）
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const { data: sleepingCustomerIds } = await client
      .from('customers')
      .select('id')
      .eq('store_id', storeId)
      .not('id', 'in', `(${activeCustomerIds?.map(r => r.customer_id).join(',') || '0'})`);

    const sleepingCustomers = sleepingCustomerIds?.length || 0;

    // 获取员工数量
    const { count: totalEmployees } = await client
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('status', 'active');

    // 获取跟进记录数量（本月）
    const { count: followUpsThisMonth } = await client
      .from('follow_up_records')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .gte('created_at', firstDayOfMonth.toISOString());

    // 获取待跟进客户数（跟进计划中红色和黄色）
    const { count: pendingFollowUpCount } = await client
      .from('follow_up_plans')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .in('urgency_level', ['red', 'yellow']);

    res.json({
      success: true,
      data: {
        customerCount: totalCustomers || 0,
        newCustomerCount: newCustomersThisMonth || 0,
        activeCustomerCount: activeCustomers || 0,
        sleepingCustomerCount: sleepingCustomers || 0,
        followUpCount: followUpsThisMonth || 0,
        pendingFollowUpCount: pendingFollowUpCount || 0,
        totalEmployees: totalEmployees || 0,
      },
    });
  } catch (error: any) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取客户增长趋势（最近6个月）
 * GET /api/v1/stores/statistics/customer-growth
 */
router.get('/statistics/customer-growth', authenticate, enforceDataIsolation, async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { storeId } = req.user!;

    const monthlyData = [];
    
    for (let i = 5; i >= 0; i--) {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - i);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);

      const { count } = await client
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .gte('created_at', startDate.toISOString())
        .lt('created_at', endDate.toISOString());

      monthlyData.push({
        month: `${startDate.getMonth() + 1}月`,
        count: count || 0,
      });
    }

    res.json({
      success: true,
      data: monthlyData,
    });
  } catch (error: any) {
    console.error('Error fetching customer growth:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
