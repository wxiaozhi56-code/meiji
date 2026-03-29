import { Router } from 'express';
import { getSupabaseClient } from '../storage/database/supabase-client';
import { authenticate, enforceDataIsolation, requireBeautician } from '../middleware/auth.middleware';
import { UserRole } from '../utils/auth.utils';

const router = Router();

// ============================================================
// 跟进提醒规则配置
// ============================================================
const FOLLOW_UP_RULES = {
  // 基准提醒周期：5天
  BASE_THRESHOLD: 5,
  
  // 不同客户类型的提醒周期
  CUSTOMER_TYPE_THRESHOLD: {
    'VIP': 3,           // VIP客户：3天
    '新客': 3,          // 新客：3天
    '高潜': 4,          // 高潜客户：4天
    '沉睡': 7,          // 沉睡客户：7天（但也需要唤醒）
    'default': 5,       // 默认：5天
  },
  
  // 紧急程度阈值
  URGENCY_THRESHOLD: {
    red: 10,      // 超过10天：紧急（红色）
    yellow: 7,    // 超过7天：待跟进（黄色）
  }
};

/**
 * 规则引擎计算优先级
 */
function calculatePriorityByRules(
  customer: any,
  lastContactDays: number
): {
  priority: number;
  suggestedAction: string;
  suggestedTiming: string;
  reason: string;
  urgencyLevel: 'red' | 'yellow' | 'green';
  recommendedTopics: string[];
  communicationStyle: string;
  bestTimeSlot: string;
} {
  const tags = customer.customer_tags || [];
  const tagNames = tags.map((t: any) => t.tag_name);
  
  // 确定客户类型和阈值
  let threshold = FOLLOW_UP_RULES.BASE_THRESHOLD;
  let isVIP = tagNames.includes('VIP');
  let isNewCustomer = tagNames.some((t: string) => t.includes('新客'));
  let isSleeping = tagNames.some((t: string) => t.includes('沉睡'));
  let isHighPotential = tagNames.some((t: string) => t.includes('高潜'));
  
  if (isVIP) threshold = FOLLOW_UP_RULES.CUSTOMER_TYPE_THRESHOLD['VIP'];
  else if (isNewCustomer) threshold = FOLLOW_UP_RULES.CUSTOMER_TYPE_THRESHOLD['新客'];
  else if (isHighPotential) threshold = FOLLOW_UP_RULES.CUSTOMER_TYPE_THRESHOLD['高潜'];
  else if (isSleeping) threshold = FOLLOW_UP_RULES.CUSTOMER_TYPE_THRESHOLD['沉睡'];
  
  // 计算优先级
  let priority = 50;
  let urgencyLevel: 'red' | 'yellow' | 'green' = 'green';
  let suggestedAction = '微信关怀';
  let suggestedTiming = '本周内';
  let reason = '定期跟进维护客户关系';
  
  const daysOverdue = lastContactDays - threshold;
  
  if (lastContactDays >= FOLLOW_UP_RULES.URGENCY_THRESHOLD.red) {
    // 超过10天：紧急
    urgencyLevel = 'red';
    priority = 90 + (isVIP ? 10 : 0);
    suggestedAction = '电话';
    suggestedTiming = '今天';
    reason = `已${lastContactDays}天未联系，需立即跟进`;
  } else if (lastContactDays >= FOLLOW_UP_RULES.URGENCY_THRESHOLD.yellow) {
    // 超过7天：待跟进
    urgencyLevel = 'yellow';
    priority = 70 + (isVIP ? 15 : 0);
    suggestedAction = '电话';
    suggestedTiming = '今天';
    reason = `超过${lastContactDays}天未联系，建议跟进`;
  } else if (daysOverdue >= 0) {
    // 超过阈值但不足7天
    urgencyLevel = 'yellow';
    priority = 60 + (isVIP ? 20 : isNewCustomer ? 15 : 0);
    suggestedAction = isVIP ? '电话' : '微信关怀';
    suggestedTiming = '今天';
    reason = `${isVIP ? 'VIP' : isNewCustomer ? '新' : ''}客户需定期维护`;
  } else {
    // 未超过阈值
    urgencyLevel = 'green';
    priority = 40;
    suggestedTiming = '本周内';
    reason = '保持常规跟进节奏';
  }
  
  // 推荐话题
  const recommendedTopics: string[] = [];
  if (tagNames.some((t: string) => t.includes('抗衰'))) recommendedTopics.push('抗衰项目');
  if (tagNames.some((t: string) => t.includes('补水'))) recommendedTopics.push('补水护理');
  if (tagNames.some((t: string) => t.includes('美白'))) recommendedTopics.push('美白方案');
  if (isVIP) recommendedTopics.push('会员专属活动');
  if (isNewCustomer) recommendedTopics.push('新客福利');
  if (isSleeping) recommendedTopics.push('回归礼遇');
  if (recommendedTopics.length === 0) recommendedTopics.push('日常关怀');
  
  return {
    priority: Math.min(priority, 100),
    suggestedAction,
    suggestedTiming,
    reason,
    urgencyLevel,
    recommendedTopics: recommendedTopics.slice(0, 3),
    communicationStyle: isVIP ? '尊贵贴心' : isNewCustomer ? '热情细致' : '亲切自然',
    bestTimeSlot: '下午2-5点',
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

    const results = [];
    const now = new Date();

    for (const customer of customers || []) {
      // 计算最后联系天数
      const records = customer.follow_up_records || [];
      let lastContactDays = 999;
      
      if (records.length > 0) {
        // 按时间排序取最新
        const sortedRecords = [...records].sort(
          (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const lastDate = new Date(sortedRecords[0].created_at);
        lastContactDays = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      // 使用规则引擎分析
      const analysisResult = calculatePriorityByRules(customer, lastContactDays);

      // Upsert跟进计划
      const { error: upsertError } = await client
        .from('follow_up_plans')
        .upsert({
          customer_id: customer.id,
          store_id: storeId,
          priority: analysisResult.priority,
          suggested_action: analysisResult.suggestedAction,
          suggested_timing: analysisResult.suggestedTiming,
          reason: analysisResult.reason,
          last_contact_days: lastContactDays,
          urgency_level: analysisResult.urgencyLevel,
          recommended_topics: analysisResult.recommendedTopics,
          communication_style: analysisResult.communicationStyle,
          best_time_slot: analysisResult.bestTimeSlot,
          calculated_at: new Date().toISOString(),
        }, {
          onConflict: 'customer_id'
        });

      if (upsertError) {
        console.error(`Failed to upsert plan for customer ${customer.id}:`, upsertError);
      } else {
        results.push({
          customerId: customer.id,
          customerName: customer.name,
          ...analysisResult,
          lastContactDays,
        });
      }
    }

    res.json({ 
      success: true, 
      message: `已分析 ${results.length} 个客户的跟进优先级`,
      calculatedAt: new Date().toISOString(),
      rules: {
        baseThreshold: FOLLOW_UP_RULES.BASE_THRESHOLD,
        vipThreshold: FOLLOW_UP_RULES.CUSTOMER_TYPE_THRESHOLD['VIP'],
        newCustomerThreshold: FOLLOW_UP_RULES.CUSTOMER_TYPE_THRESHOLD['新客'],
      }
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
      query = query.eq('customers.responsible_user_id', userId);
    } else {
      query = query.eq('store_id', storeId);
    }

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

    let customerQuery = client.from('customers').select('id', { count: 'exact', head: true });
    
    if (role === UserRole.BEAUTICIAN) {
      customerQuery = customerQuery.eq('responsible_user_id', userId);
    } else {
      customerQuery = customerQuery.eq('store_id', storeId);
    }

    const { count: totalCustomers } = await customerQuery;

    if (role === UserRole.BEAUTICIAN) {
      const { data: customerIds } = await client
        .from('customers')
        .select('id')
        .eq('responsible_user_id', userId);
      
      const ids = (customerIds || []).map(c => c.id);
      if (ids.length > 0) {
        const { count: urgentCount } = await client
          .from('follow_up_plans')
          .select('id', { count: 'exact', head: true })
          .in('customer_id', ids)
          .eq('urgency_level', 'red');

        const { count: pendingCount } = await client
          .from('follow_up_plans')
          .select('id', { count: 'exact', head: true })
          .in('customer_id', ids)
          .eq('urgency_level', 'yellow');

        const { count: normalCount } = await client
          .from('follow_up_plans')
          .select('id', { count: 'exact', head: true })
          .in('customer_id', ids)
          .eq('urgency_level', 'green');

        res.json({
          totalCustomers: totalCustomers || 0,
          todayPending: (urgentCount || 0) + (pendingCount || 0),
          weekPending: (urgentCount || 0) + (pendingCount || 0) + (normalCount || 0),
          highPriority: urgentCount || 0,
          urgentCount: urgentCount || 0,
          pendingCount: pendingCount || 0,
          normalCount: normalCount || 0,
        });
        return;
      } else {
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
      const { count: urgentCount } = await client
        .from('follow_up_plans')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('urgency_level', 'red');

      const { count: pendingCount } = await client
        .from('follow_up_plans')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('urgency_level', 'yellow');

      const { count: normalCount } = await client
        .from('follow_up_plans')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('urgency_level', 'green');

      res.json({
        totalCustomers: totalCustomers || 0,
        todayPending: (urgentCount || 0) + (pendingCount || 0),
        weekPending: (urgentCount || 0) + (pendingCount || 0) + (normalCount || 0),
        highPriority: urgentCount || 0,
        urgentCount: urgentCount || 0,
        pendingCount: pendingCount || 0,
        normalCount: normalCount || 0,
      });
    }
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
