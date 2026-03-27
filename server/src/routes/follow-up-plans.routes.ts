import { Router } from 'express';
import { getSupabaseClient } from '../storage/database/supabase-client';
import { authenticate, enforceDataIsolation, requireBeautician } from '../middleware/auth.middleware';
import { UserRole } from '../utils/auth.utils';

const router = Router();

/**
 * 计算跟进优先级的辅助函数
 */
async function calculateCustomerPriority(client: any, customer: any) {
  const now = new Date();
  const records = customer.follow_up_records || [];
  const tags = customer.customer_tags || [];
  
  // 计算最后联系天数
  let lastContactDays = 999;
  if (records.length > 0) {
    const lastRecord = records[0];
    const lastDate = new Date(lastRecord.created_at);
    lastContactDays = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  }
  
  // 计算基础优先级
  let priority = 50;
  
  // 生命周期阶段调整
  const lifecycleTags = tags.filter((t: any) => t.category === '生命周期');
  if (lifecycleTags.some((t: any) => t.tag_name.includes('新客'))) {
    priority += 20;
  } else if (lifecycleTags.some((t: any) => t.tag_name.includes('沉睡'))) {
    priority += 25;
  }
  
  // VIP客户加分
  if (tags.some((t: any) => t.tag_name.includes('VIP'))) {
    priority += 15;
  }
  
  // 时间衰减
  if (lastContactDays > 7) {
    priority += Math.min(lastContactDays - 7, 30);
  }
  
  // 确定紧急程度
  let urgencyLevel: 'red' | 'yellow' | 'green' = 'green';
  if (lastContactDays > 3) {
    urgencyLevel = 'red';
  } else if (lastContactDays > 2) {
    urgencyLevel = 'yellow';
  }
  
  // 建议行动
  let suggestedAction = '电话';
  let suggestedTiming = '今天';
  let reason = '需要跟进维护客户关系';
  
  if (lastContactDays > 7) {
    suggestedAction = '电话';
    suggestedTiming = '今天';
    reason = `超过${lastContactDays}天未联系，需要立即跟进`;
  } else if (lastContactDays > 3) {
    suggestedAction = '微信关怀';
    suggestedTiming = '今天';
    reason = '近期未联系，建议进行关怀互动';
  } else if (tags.some((t: any) => t.tag_name.includes('抗衰'))) {
    suggestedAction = '项目推荐';
    suggestedTiming = '本周内';
    reason = '客户有抗衰需求，可推荐相关项目';
  } else if (tags.some((t: any) => t.tag_name.includes('VIP'))) {
    suggestedAction = '活动邀约';
    suggestedTiming = '本周内';
    reason = 'VIP客户，邀请参加门店活动';
  }
  
  return {
    priority: Math.min(priority, 100),
    suggestedAction,
    suggestedTiming,
    reason,
    lastContactDays,
    urgencyLevel,
  };
}

/**
 * 计算客户的跟进优先级
 * POST /api/v1/follow-up-plans/calculate
 */
router.post('/calculate', authenticate, enforceDataIsolation, requireBeautician, async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { storeId, userId, role } = req.user!;

    // 构建查询：获取客户数据
    let query = client
      .from('customers')
      .select(`
        *,
        customer_tags (*),
        customer_profiles (*),
        follow_up_records (*)
      `);

    // 数据隔离：美容师只计算自己的客户
    if (role === UserRole.BEAUTICIAN) {
      query = query.eq('responsible_user_id', userId);
    } else {
      // 老板和店长计算门店所有客户
      query = query.eq('store_id', storeId);
    }

    const { data: customers, error: customersError } = await query;

    if (customersError) throw customersError;

    const plans = [];

    for (const customer of customers || []) {
      const priorityData = await calculateCustomerPriority(client, customer);

      // Upsert跟进计划
      const { error: upsertError } = await client
        .from('follow_up_plans')
        .upsert({
          customer_id: customer.id,
          store_id: storeId,
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
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取待跟进客户列表（仪表盘）
 * GET /api/v1/follow-up-plans
 */
router.get('/', authenticate, enforceDataIsolation, requireBeautician, async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { storeId, userId, role } = req.user!;
    const { timing } = req.query; // today, this_week, all

    // 构建查询
    let query = client
      .from('follow_up_plans')
      .select(`
        *,
        customers (
          id,
          name,
          phone,
          responsible_user_id,
          customer_tags (*),
          customer_profiles (*)
        )
      `)
      .order('priority', { ascending: false });

    // 数据隔离：美容师只能看自己的客户跟进计划
    if (role === UserRole.BEAUTICIAN) {
      // 通过customers表的responsible_user_id过滤
      query = query.eq('customers.responsible_user_id', userId);
    } else {
      // 老板和店长可以看门店所有客户的跟进计划
      query = query.eq('store_id', storeId);
    }

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
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取仪表盘统计
 * GET /api/v1/follow-up-plans/stats
 */
router.get('/stats', authenticate, enforceDataIsolation, requireBeautician, async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { storeId, userId, role } = req.user!;

    // 构建基础查询条件
    let customerQuery = client.from('customers').select('id', { count: 'exact', head: true });
    
    // 数据隔离
    if (role === UserRole.BEAUTICIAN) {
      customerQuery = customerQuery.eq('responsible_user_id', userId);
    } else {
      customerQuery = customerQuery.eq('store_id', storeId);
    }

    // 总客户数
    const { count: totalCustomers } = await customerQuery;

    // 构建跟进计划查询条件
    let planQuery = client.from('follow_up_plans').select('id', { count: 'exact', head: true });
    
    // 数据隔离
    if (role === UserRole.BEAUTICIAN) {
      // 需要通过customer_id关联查询
      const { data: customerIds } = await client
        .from('customers')
        .select('id')
        .eq('responsible_user_id', userId);
      
      const ids = (customerIds || []).map(c => c.id);
      if (ids.length > 0) {
        planQuery = planQuery.in('customer_id', ids);
      } else {
        // 没有客户，返回空统计
        return res.json({
          totalCustomers: 0,
          todayPending: 0,
          weekPending: 0,
          highPriority: 0,
          urgentCount: 0,
          pendingCount: 0,
          normalCount: 0,
        });
      }
    } else {
      planQuery = planQuery.eq('store_id', storeId);
    }

    // 紧急待跟进（红色 - 超过3天）
    const { count: urgentCount } = await planQuery.eq('urgency_level', 'red');

    // 今日待跟进（黄色 - 超过2天）
    const { count: pendingCount } = await planQuery.eq('urgency_level', 'yellow');

    // 正常跟进（绿色）
    const { count: normalCount } = await planQuery.eq('urgency_level', 'green');

    res.json({
      totalCustomers: totalCustomers || 0,
      todayPending: (urgentCount || 0) + (pendingCount || 0),
      weekPending: (urgentCount || 0) + (pendingCount || 0) + (normalCount || 0),
      highPriority: urgentCount || 0,
      urgentCount: urgentCount || 0,
      pendingCount: pendingCount || 0,
      normalCount: normalCount || 0,
    });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
