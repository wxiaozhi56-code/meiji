import { Router } from 'express';
import { getSupabaseClient } from '../storage/database/supabase-client';
import { authenticate, enforceDataIsolation, requireBeautician } from '../middleware/auth.middleware';
import { UserRole } from '../utils/auth.utils';
import { Config, LLMClient, HeaderUtils } from 'coze-coding-dev-sdk';

const router = Router();

// ============================================================
// ⚠️ 重要：静态路由必须在动态路由 /:customerId 之前定义！
// 否则 "generate" 会被当作 customerId 处理
// ============================================================

/**
 * 生成客户深度分析报告
 * POST /api/v1/analysis/generate
 */
router.post('/generate', authenticate, enforceDataIsolation, requireBeautician, async (req, res) => {
  try {
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();
    const llmClient = new LLMClient(config, customHeaders);

    const { customerId } = req.body;
    const client = getSupabaseClient();
    const { storeId, userId, role } = req.user!;

    if (!customerId) {
      return res.status(400).json({ success: false, error: '缺少客户ID' });
    }

    // 1. 验证客户权限
    let customerQuery = client
      .from('customers')
      .select(`
        *,
        customer_tags (*),
        customer_profiles (*),
        follow_up_records (*),
        ai_briefs (*)
      `)
      .eq('id', customerId);

    // 数据隔离
    if (role === UserRole.BEAUTICIAN) {
      customerQuery = customerQuery.eq('responsible_user_id', userId);
    } else {
      customerQuery = customerQuery.eq('store_id', storeId);
    }

    const { data: customer, error: customerError } = await customerQuery.maybeSingle();

    if (customerError) throw customerError;
    if (!customer) {
      return res.status(404).json({ success: false, error: '客户不存在或无权访问' });
    }

    // 2. 构建分析Prompt
    const tags = customer.customer_tags || [];
    const profiles = customer.customer_profiles || [];
    const followUpRecords = customer.follow_up_records || [];
    const aiBriefs = customer.ai_briefs || [];

    const prompt = `你是一个专业的美容院客户关系管理分析师。请根据以下客户数据，生成一份详细的360°深度分析报告。

## 客户基本信息
- 姓名：${customer.name}
- 电话：${customer.phone || '未记录'}

## 标签库（所有历史标签）
${tags.map((t: any) => `- ${t.tag_name}（${t.category}）`).join('\n') || '暂无标签'}

## 客户资料
${profiles.map((p: any) => `- ${p.field_name}: ${p.field_value}`).join('\n') || '暂无资料'}

## 跟进历史（最近10条）
${followUpRecords.slice(-10).map((r: any) => 
  `- [${r.created_at?.split('T')[0] || ''}] ${r.content?.substring(0, 100) || ''}`
).join('\n') || '暂无跟进记录'}

## AI简报历史
${aiBriefs.slice(-3).map((b: any) => 
  `- ${b.summary}`
).join('\n') || '暂无AI简报'}

---

请生成一份结构化的JSON分析报告，包含以下维度：

\`\`\`json
{
  "customerValue": {
    "consumptionRating": 4,
    "consumptionPotential": "high",
    "lifecycleStage": "growing",
    "ltvEstimate": 12000,
    "ltvEstimateReason": "基于消费频次和客单价预测"
  },
  "statusAnalysis": {
    "emotionalState": "焦虑（因女儿升学压力）",
    "skinCondition": "脸颊干、法令纹明显",
    "lifeEvents": "女儿刚考上大学",
    "visitFrequency": "normal",
    "churnRisk": "medium"
  },
  "coreNeeds": {
    "topNeeds": ["法令纹改善", "抗衰", "补水"],
    "unmetNeeds": ["失眠导致的皮肤问题"],
    "interests": ["射频类仪器", "深层补水项目"]
  },
  "followUpStrategy": {
    "bestTiming": "今天（距上次到店已超2周）",
    "bestChannel": "微信私聊",
    "suggestedStaff": "小李",
    "communicationStyle": "关怀型"
  },
  "salesRecommendation": {
    "primaryRecommendation": "补水+射频抗衰套餐",
    "secondaryRecommendation": "助眠精油护理",
    "avoidItems": ["酸类焕肤（客户反馈刺激）"],
    "pitchAngle": "姐，恭喜宝贝考上大学！最近操心又失眠，皮肤容易干...",
    "discountStrategy": "适合推套餐，不适合直接推高价单品"
  },
  "riskWarning": {
    "churnAlert": "最近到店间隔较长，建议跟进",
    "complaintAlert": null,
    "priceSensitivity": "medium"
  },
  "fullReportMarkdown": "完整的Markdown格式报告文本"
}
\`\`\`

**重要：** 
1. 分析要基于提供的真实数据，不要凭空捏造
2. fullReportMarkdown需要生成完整的、格式化的Markdown报告
3. 只返回JSON，不要其他内容`;

    const messages = [{ role: 'user' as const, content: prompt }];
    const llmResult = await llmClient.invoke(messages, { temperature: 0.7 });

    // 3. 解析AI结果
    let analysis;
    try {
      let jsonContent = llmResult.content;
      
      // 尝试提取JSON
      if (jsonContent.includes('```json')) {
        jsonContent = jsonContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      } else if (jsonContent.includes('```')) {
        jsonContent = jsonContent.replace(/```\s*/g, '');
      }
      
      const jsonStart = jsonContent.indexOf('{');
      if (jsonStart !== -1) {
        let depth = 0;
        let jsonEnd = jsonStart;
        for (let i = jsonStart; i < jsonContent.length; i++) {
          if (jsonContent[i] === '{') depth++;
          else if (jsonContent[i] === '}') depth--;
          if (depth === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
        jsonContent = jsonContent.substring(jsonStart, jsonEnd);
      }
      
      analysis = JSON.parse(jsonContent);
    } catch (e) {
      console.error('Failed to parse analysis:', e);
      
      // 返回默认分析
      const tagNames = tags.map((t: any) => t.tag_name);
      analysis = {
        customerValue: {
          consumptionRating: tagNames.includes('#VIP客户') ? 4 : 3,
          consumptionPotential: 'medium',
          lifecycleStage: 'growing',
          ltvEstimate: 8000,
        },
        statusAnalysis: {
          visitFrequency: 'normal',
          churnRisk: 'low',
        },
        coreNeeds: {
          topNeeds: [],
          unmetNeeds: [],
          interests: [],
        },
        followUpStrategy: {
          bestTiming: '本周内',
          bestChannel: '微信关怀',
          communicationStyle: '关怀型',
        },
        salesRecommendation: {
          primaryRecommendation: '基础补水护理',
          pitchAngle: '姐，最近有空来做一次护理吗？',
        },
        riskWarning: {
          priceSensitivity: 'medium',
        },
        fullReportMarkdown: `# 客户深度分析报告\n\n## 客户：${customer.name}\n\n基于现有数据分析生成。`,
      };
    }

    // 4. 保存到数据库（先删除旧报告）
    await client
      .from('customer_analysis_reports')
      .delete()
      .eq('customer_id', customerId);

    const { data: savedReport, error: saveError } = await client
      .from('customer_analysis_reports')
      .insert({
        customer_id: customerId,
        store_id: storeId,
        consumption_rating: analysis.customerValue?.consumptionRating || 3,
        consumption_potential: analysis.customerValue?.consumptionPotential || 'medium',
        lifecycle_stage: analysis.customerValue?.lifecycleStage || 'new',
        ltv_estimate: analysis.customerValue?.ltvEstimate || 0,
        emotional_state: analysis.statusAnalysis?.emotionalState,
        skin_condition: analysis.statusAnalysis?.skinCondition,
        life_events: analysis.statusAnalysis?.lifeEvents,
        visit_frequency: analysis.statusAnalysis?.visitFrequency || 'normal',
        churn_risk: analysis.statusAnalysis?.churnRisk || 'low',
        top_needs: JSON.stringify(analysis.coreNeeds?.topNeeds || []),
        unmet_needs: JSON.stringify(analysis.coreNeeds?.unmetNeeds || []),
        interests: JSON.stringify(analysis.coreNeeds?.interests || []),
        best_timing: analysis.followUpStrategy?.bestTiming,
        best_channel: analysis.followUpStrategy?.bestChannel,
        suggested_staff: analysis.followUpStrategy?.suggestedStaff,
        communication_style: analysis.followUpStrategy?.communicationStyle,
        primary_recommendation: analysis.salesRecommendation?.primaryRecommendation,
        secondary_recommendation: analysis.salesRecommendation?.secondaryRecommendation,
        avoid_items: JSON.stringify(analysis.salesRecommendation?.avoidItems || []),
        pitch_angle: analysis.salesRecommendation?.pitchAngle,
        discount_strategy: analysis.salesRecommendation?.discountStrategy,
        churn_alert: analysis.riskWarning?.churnAlert,
        complaint_alert: analysis.riskWarning?.complaintAlert,
        price_sensitivity: analysis.riskWarning?.priceSensitivity || 'medium',
        full_report: analysis.fullReportMarkdown,
      })
      .select()
      .single();

    if (saveError) throw saveError;

    res.json({
      success: true,
      report: savedReport,
    });
  } catch (error: any) {
    console.error('Error generating analysis:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 生成智能话术
 * POST /api/v1/ai/messages
 */
router.post('/messages', authenticate, enforceDataIsolation, requireBeautician, async (req, res) => {
  try {
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const config = new Config();
    const llmClient = new LLMClient(config, customHeaders);

    const { customerId, followUpRecordId, customContext } = req.body;
    const client = getSupabaseClient();
    const { storeId, userId, role } = req.user!;

    if (!customerId) {
      return res.status(400).json({ success: false, error: '缺少客户ID' });
    }

    // 1. 验证客户权限
    let customerQuery = client
      .from('customers')
      .select(`
        *,
        customer_tags (*),
        follow_up_records (*)
      `)
      .eq('id', customerId);

    // 数据隔离
    if (role === UserRole.BEAUTICIAN) {
      customerQuery = customerQuery.eq('responsible_user_id', userId);
    } else {
      customerQuery = customerQuery.eq('store_id', storeId);
    }

    const { data: customer, error: customerError } = await customerQuery.maybeSingle();

    if (customerError) throw customerError;
    if (!customer) {
      return res.status(404).json({ success: false, error: '客户不存在或无权访问' });
    }

    // 2. 获取跟进记录（如果有）
    let followUpRecord = null;
    if (followUpRecordId) {
      const { data } = await client
        .from('follow_up_records')
        .select('*')
        .eq('id', followUpRecordId)
        .single();
      followUpRecord = data;
    }

    // 3. 构建生成话术的Prompt
    const tags = customer.customer_tags || [];
    const recentRecords = (customer.follow_up_records || []).slice(-3);

    const prompt = `你是一个美容院客户关系管理助手。请根据客户信息生成3条个性化的跟进话术。

## 客户信息
- 姓名：${customer.name}
- 标签：${tags.map((t: any) => t.tag_name).join('、') || '暂无'}

## 最近跟进记录
${recentRecords.map((r: any) => `- ${r.content?.substring(0, 100)}`).join('\n') || '暂无'}

${followUpRecord ? `## 本次跟进内容\n${followUpRecord.content}` : ''}

${customContext ? `## 额外要求\n${customContext}` : ''}

---

请生成3条不同风格的话术（关怀型、促销型、服务型），格式如下：
[
  {"type": "关怀型", "content": "话术内容..."},
  {"type": "促销型", "content": "话术内容..."},
  {"type": "服务型", "content": "话术内容..."}
]

只返回JSON数组，不要其他内容。`;

    const messages = [{ role: 'user' as const, content: prompt }];
    const llmResult = await llmClient.invoke(messages, { temperature: 0.8 });

    // 4. 解析结果
    let generatedMessages = [];
    try {
      let jsonContent = llmResult.content;
      if (jsonContent.includes('```')) {
        jsonContent = jsonContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      }
      
      const jsonStart = jsonContent.indexOf('[');
      if (jsonStart !== -1) {
        let depth = 0;
        let jsonEnd = jsonStart;
        for (let i = jsonStart; i < jsonContent.length; i++) {
          if (jsonContent[i] === '[') depth++;
          else if (jsonContent[i] === ']') depth--;
          if (depth === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
        jsonContent = jsonContent.substring(jsonStart, jsonEnd);
      }
      
      generatedMessages = JSON.parse(jsonContent);
    } catch (e) {
      console.error('Failed to parse messages:', e);
      generatedMessages = [
        { type: '关怀型', content: `姐，最近怎么样？有空来店里坐坐~` },
        { type: '服务型', content: `姐，您的护理项目快到期了，记得来做个保养哦~` },
        { type: '促销型', content: `姐，最近店里有个优惠活动，很适合您的需求~` },
      ];
    }

    // 5. 保存生成的话术
    const messagesToSave = generatedMessages.map((msg: any, index: number) => ({
      customer_id: customerId,
      store_id: storeId,
      type: msg.type,
      content: msg.content,
      follow_up_record_id: followUpRecordId || null,
    }));

    if (messagesToSave.length > 0) {
      const { data: savedMessages, error: saveError } = await client
        .from('generated_messages')
        .insert(messagesToSave)
        .select();

      if (saveError) {
        console.error('Failed to save messages:', saveError);
      }

      // 返回带有ID的消息
      if (savedMessages) {
        res.json(savedMessages);
        return;
      }
    }

    res.json(generatedMessages.map((msg: any, index: number) => ({
      id: Date.now() + index,
      ...msg,
    })));
  } catch (error: any) {
    console.error('Error generating messages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取客户分析报告
 * GET /api/v1/analysis/:customerId
 * 
 * ⚠️ 注意：此动态路由必须放在所有静态路由之后
 */
router.get('/:customerId', authenticate, enforceDataIsolation, requireBeautician, async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { customerId } = req.params;
    const { storeId, userId, role } = req.user!;

    // 验证客户权限
    let customerQuery = client
      .from('customers')
      .select('id')
      .eq('id', parseInt(customerId));

    // 数据隔离
    if (role === UserRole.BEAUTICIAN) {
      customerQuery = customerQuery.eq('responsible_user_id', userId);
    } else {
      customerQuery = customerQuery.eq('store_id', storeId);
    }

    const { data: existingCustomer } = await customerQuery.maybeSingle();

    if (!existingCustomer) {
      return res.status(404).json({ success: false, error: '客户不存在或无权访问' });
    }

    // 获取最新的分析报告
    const { data: report, error } = await client
      .from('customer_analysis_reports')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    res.json({
      success: true,
      report,
    });
  } catch (error: any) {
    console.error('Error fetching analysis:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
