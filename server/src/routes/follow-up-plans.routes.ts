import { Router } from 'express';
import { getSupabaseClient } from '../storage/database/supabase-client';
import { authenticate, enforceDataIsolation, requireBeautician } from '../middleware/auth.middleware';
import { UserRole } from '../utils/auth.utils';
import { Config, LLMClient, HeaderUtils } from 'coze-coding-dev-sdk';

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
 * 使用AI分析客户跟进建议
 */
async function analyzeCustomerWithAI(
  llmClient: LLMClient,
  customer: any,
  lastContactDays: number
): Promise<{
  priority: number;
  suggestedAction: string;
  suggestedTiming: string;
  reason: string;
  urgencyLevel: 'red' | 'yellow' | 'green';
  recommendedTopics: string[];
  communicationStyle: string;
  bestTimeSlot: string;
}> {
  const tags = customer.customer_tags || [];
  const profiles = customer.customer_profiles || [];
  const followUpRecords = customer.follow_up_records || [];
  
  const prompt = `你是一位专业的美容院客户关系管理专家。请分析以下客户信息，给出最佳的跟进建议。

## 客户信息
- 姓名：${customer.name}
- 电话：${customer.phone || '未记录'}
- 标签：${tags.map((t: any) => t.tag_name).join('、') || '无'}
- 客户资料：${profiles.map((p: any) => `${p.field_name}:${p.field_value}`).join('、') || '无'}
- 最后联系：${lastContactDays === 999 ? '从未联系' : `${lastContactDays}天前`}
- 最近跟进记录：${followUpRecords.slice(-3).map((r: any) => r.content?.substring(0, 50)).join('；') || '无'}

## 跟进提醒规则
- 基准周期：${FOLLOW_UP_RULES.BASE_THRESHOLD}天必须跟进一次
- VIP客户：${FOLLOW_UP_RULES.CUSTOMER_TYPE_THRESHOLD['VIP']}天
- 新客：${FOLLOW_UP_RULES.CUSTOMER_TYPE_THRESHOLD['新客']}天
- 高潜客户：${FOLLOW_UP_RULES.CUSTOMER_TYPE_THRESHOLD['高潜']}天
- 沉睡客户：${FOLLOW_UP_RULES.CUSTOMER_TYPE_THRESHOLD['沉睡']}天

请根据以上信息，生成JSON格式的跟进建议：

\`\`\`json
{
  "priority": 85,
  "suggestedAction": "电话联系",
  "suggestedTiming": "今天",
  "reason": "该客户是VIP客户，已超过5天未联系，需要保持高频互动维护关系",
  "urgencyLevel": "red",
  "recommendedTopics": ["新品推荐", "会员权益", "预约提醒"],
  "communicationStyle": "热情专业，关注客户近期状态",
  "bestTimeSlot": "下午2-4点"
}
\`\`\`

要求：
1. priority: 1-100的优先级分数，分数越高越紧急
2. suggestedAction: 建议的跟进方式（电话/微信关怀/项目推荐/活动邀约）
3. suggestedTiming: 建议的跟进时机（今天/明天/本周内）
4. reason: 为什么该跟进这个客户（30字以内）
5. urgencyLevel: 紧急程度 red/yellow/green
6. recommendedTopics: 推荐的沟通话题（2-4个）
7. communicationStyle: 建议的沟通风格
8. bestTimeSlot: 最佳联系时间段

只返回JSON，不要其他文字。`;

  try {
    const response = await llmClient.chat({
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    });

    const content = response.choices?.[0]?.message?.content || '';
    
    // 提取JSON
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const result = JSON.parse(jsonStr);
      
      return {
        priority: result.priority || 50,
        suggestedAction: result.suggestedAction || '电话',
        suggestedTiming: result.suggestedTiming || '今天',
        reason: result.reason || '需要跟进维护客户关系',
        urgencyLevel: result.urgencyLevel || 'green',
        recommendedTopics: result.recommendedTopics || [],
        communicationStyle: result.communicationStyle || '',
        bestTimeSlot: result.bestTimeSlot || '',
      };
    }
  } catch (error) {
    console.error('AI analysis error:', error);
  }

  // 降级：使用规则引擎
  return calculatePriorityByRules(customer, lastContactDays);
}

/**
 * 规则引擎计算优先级（降级方案）
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
 * 计算客户的跟进优先级（使用AI分析）
 * POST /api/v1/follow-up-plans/calculate
 */
router.post('/calculate', authenticate, enforceDataIsolation, requireBeautician, async (req, res) => {
  try {
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();
    const llmClient = new LLMClient(config, customHeaders);
    
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

      // 使用AI分析（或降级到规则引擎）
      let analysisResult;
      try {
        analysisResult = await analyzeCustomerWithAI(llmClient, customer, lastContactDays);
      } catch (aiError) {
        console.error('AI analysis failed, using rules:', aiError);
        analysisResult = calculatePriorityByRules(customer, lastContactDays);
      }

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

    // 数据隔离：根据角色查询跟进计划
    if (role === UserRole.BEAUTICIAN) {
      const { data: customerIds } = await client
        .from('customers')
        .select('id')
        .eq('responsible_user_id', userId);
      
      const ids = (customerIds || []).map(c => c.id);
      if (ids.length > 0) {
        // 紧急待跟进（红色）- 需要重新创建查询对象
        const { count: urgentCount } = await client
          .from('follow_up_plans')
          .select('id', { count: 'exact', head: true })
          .in('customer_id', ids)
          .eq('urgency_level', 'red');

        // 待跟进（黄色）- 需要重新创建查询对象
        const { count: pendingCount } = await client
          .from('follow_up_plans')
          .select('id', { count: 'exact', head: true })
          .in('customer_id', ids)
          .eq('urgency_level', 'yellow');

        // 正常跟进（绿色）- 需要重新创建查询对象
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
      // 老板和店长：按 store_id 查询
      // 紧急待跟进（红色）- 需要重新创建查询对象
      const { count: urgentCount } = await client
        .from('follow_up_plans')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('urgency_level', 'red');

      // 待跟进（黄色）- 需要重新创建查询对象
      const { count: pendingCount } = await client
        .from('follow_up_plans')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('urgency_level', 'yellow');

      // 正常跟进（绿色）- 需要重新创建查询对象
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
