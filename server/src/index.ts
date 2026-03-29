import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { getSupabaseClient } from "./storage/database/supabase-client";
import authRoutes from "./routes/auth.routes";
import customerRoutes from "./routes/customer.routes";
import followUpPlansRoutes from "./routes/follow-up-plans.routes";
import uploadRoutes from "./routes/upload.routes";
import aiRoutes from "./routes/ai.routes";
import employeeRoutes from "./routes/employee.routes";
import storeRoutes from "./routes/store.routes";

// 加载环境变量
dotenv.config();

const app = express();
const port = process.env.PORT || 9091;

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health check
app.get('/api/v1/health', (req, res) => {
  console.log('Health check success');
  res.status(200).json({ status: 'ok' });
});

// Auth routes
app.use('/api/v1/auth', authRoutes);

// Customer routes (with data isolation)
app.use('/api/v1/customers', customerRoutes);

// Follow-up plans routes (with data isolation)
app.use('/api/v1/follow-up-plans', followUpPlansRoutes);

// Upload routes (with data isolation)
app.use('/api/v1/upload', uploadRoutes);

// AI routes (with data isolation)
app.use('/api/v1/analysis', aiRoutes);
app.use('/api/v1/ai', aiRoutes);

// Employee routes (with data isolation, store owner only)
app.use('/api/v1/employees', employeeRoutes);

// Store routes (with data isolation)
app.use('/api/v1/stores', storeRoutes);

// Get all customers
app.get('/api/v1/customers', async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('customers')
      .select(`
        *,
        customer_tags (*)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get customer by ID
app.get('/api/v1/customers/:id', async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { id } = req.params;

    const { data, error } = await client
      .from('customers')
      .select(`
        *,
        customer_tags (*),
        follow_up_records (*),
        ai_briefs (*),
        generated_messages (*),
        customer_profiles (*)
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // 过滤掉过期的智能话术（expires_at < now）
    if (data.generated_messages && data.generated_messages.length > 0) {
      const now = new Date();
      data.generated_messages = data.generated_messages.filter(
        (msg: any) => !msg.expires_at || new Date(msg.expires_at) > now
      );
    }

    res.json(data);
  } catch (error: any) {
    console.error('Error fetching customer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update customer profile field (upsert)
app.post('/api/v1/customer-profiles', async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { customerId, fieldName, fieldValue } = req.body;

    if (!customerId || !fieldName) {
      return res.status(400).json({ error: 'customerId and fieldName are required' });
    }

    // Upsert: 如果存在则更新，不存在则插入
    const { data, error } = await client
      .from('customer_profiles')
      .upsert({
        customer_id: customerId,
        field_name: fieldName,
        field_value: fieldValue || '',
      }, {
        onConflict: 'customer_id,field_name'
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    console.error('Error updating customer profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete customer profile field
app.delete('/api/v1/customer-profiles/:id', async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { id } = req.params;

    const { error } = await client
      .from('customer_profiles')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true, message: '资料已删除' });
  } catch (error: any) {
    console.error('Error deleting customer profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete follow-up record by ID
app.delete('/api/v1/follow-up-records/:id', async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { id } = req.params;

    // 先删除关联的话术和AI简报
    await client.from('generated_messages').delete().eq('follow_up_record_id', id);
    await client.from('ai_briefs').delete().eq('follow_up_record_id', id);
    
    // 再删除跟进记录
    const { error } = await client
      .from('follow_up_records')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true, message: '跟进记录已删除' });
  } catch (error: any) {
    console.error('Error deleting follow-up record:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete customer by ID
app.delete('/api/v1/customers/:id', async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { id } = req.params;

    // Delete customer (cascade will delete related data)
    const { error } = await client
      .from('customers')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true, message: '客户已删除' });
  } catch (error: any) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get follow-up record by ID
app.get('/api/v1/follow-up-records/:id', async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { id } = req.params;

    const { data, error } = await client
      .from('follow_up_records')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Follow-up record not found' });
    }
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching follow-up record:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== 智能跟进仪表盘 API ====================

/**
 * 计算单个客户的跟进优先级（2天跟进规则）
 */
async function calculateCustomerPriority(client: any, customer: any) {
  let priority = 0;
  let suggestedAction = '微信关怀';
  let suggestedTiming = '暂无';
  let reasons: string[] = [];
  let urgencyLevel: 'red' | 'yellow' | 'green' = 'green';

  // 1. 计算距上次联系天数
  const lastRecord = customer.follow_up_records?.[customer.follow_up_records?.length - 1];
  let lastContactDays = 999;
  if (lastRecord?.created_at) {
    const lastDate = new Date(lastRecord.created_at);
    const now = new Date();
    lastContactDays = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  // 2. 核心规则：2天跟进机制
  if (lastContactDays >= 999) {
    priority = 90;
    suggestedTiming = '今天';
    suggestedAction = '电话联系';
    urgencyLevel = 'red';
    reasons.push('新客户从未跟进');
  } else if (lastContactDays >= 3) {
    priority = 80 + Math.min(lastContactDays - 3, 15);
    suggestedTiming = '今天';
    suggestedAction = lastContactDays >= 7 ? '电话联系' : '微信关怀';
    urgencyLevel = 'red';
    reasons.push(`已${lastContactDays}天未跟进，请立即联系`);
  } else if (lastContactDays >= 2) {
    priority = 70;
    suggestedTiming = '今天';
    urgencyLevel = 'yellow';
    reasons.push('超过2天未跟进，今日需联系');
  } else if (lastContactDays === 1) {
    priority = 30;
    suggestedTiming = '本周内';
    urgencyLevel = 'green';
    reasons.push('跟进状态良好');
  } else {
    priority = 20;
    suggestedTiming = '暂无';
    urgencyLevel = 'green';
    reasons.push('今日已跟进');
  }

  // 3. 根据标签调整优先级
  const tags = customer.customer_tags || [];
  const tagNames = tags.map((t: any) => t.tag_name);
  
  if (tagNames.some((t: string) => t.includes('VIP'))) {
    priority += 10;
    reasons.push('VIP客户需重点关注');
  }
  if (tagNames.some((t: string) => t.includes('沉睡'))) {
    priority += 15;
    if (urgencyLevel !== 'red') urgencyLevel = 'yellow';
    reasons.push('沉睡客户需激活');
  }
  if (tagNames.some((t: string) => t.includes('高意向'))) {
    priority += 8;
    reasons.push('高意向客户');
  }
  if (tagNames.some((t: string) => t.includes('到期') || t.includes('续费'))) {
    priority += 12;
    suggestedAction = '活动邀约';
    if (urgencyLevel !== 'red') urgencyLevel = 'yellow';
    reasons.push('套餐即将到期');
  }

  // 4. 根据客户资料调整
  const profiles = customer.customer_profiles || [];
  profiles.forEach((p: any) => {
    if (p.field_name.includes('消费') || p.field_name.includes('套餐')) {
      priority += 5;
    }
  });

  // 5. 限制优先级范围
  priority = Math.max(0, Math.min(100, priority));

  // 6. 生成原因描述
  let reason = reasons.join('；') || '建议定期跟进维护关系';

  return {
    priority,
    suggestedAction,
    suggestedTiming,
    reason,
    lastContactDays,
    urgencyLevel
  };
}

// 计算所有客户的跟进优先级
app.post('/api/v1/follow-up-plans/calculate', async (req, res) => {
  try {
    const client = getSupabaseClient();
    
    const { data: customers, error: customersError } = await client
      .from('customers')
      .select(`
        *,
        customer_tags (*),
        customer_profiles (*),
        follow_up_records (*)
      `);

    if (customersError) throw customersError;

    const plans = [];

    for (const customer of customers || []) {
      const priorityData = await calculateCustomerPriority(client, customer);

      const { error: upsertError } = await client
        .from('follow_up_plans')
        .upsert({
          customer_id: customer.id,
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
    res.status(500).json({ error: error.message });
  }
});

// 获取待跟进客户列表（仪表盘）
app.get('/api/v1/follow-up-plans', async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { timing } = req.query;

    let query = client
      .from('follow_up_plans')
      .select(`
        *,
        customers (
          id,
          name,
          phone,
          customer_tags (*),
          customer_profiles (*)
        )
      `)
      .order('priority', { ascending: false });

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
    res.status(500).json({ error: error.message });
  }
});

// 获取仪表盘统计
app.get('/api/v1/follow-up-plans/stats', async (req, res) => {
  try {
    const client = getSupabaseClient();

    const { count: totalCustomers } = await client
      .from('customers')
      .select('*', { count: 'exact', head: true });

    const { count: urgentCount } = await client
      .from('follow_up_plans')
      .select('*', { count: 'exact', head: true })
      .eq('urgency_level', 'red');

    const { count: todayCount } = await client
      .from('follow_up_plans')
      .select('*', { count: 'exact', head: true })
      .eq('urgency_level', 'yellow');

    const { count: weekCount } = await client
      .from('follow_up_plans')
      .select('*', { count: 'exact', head: true })
      .in('urgency_level', ['red', 'yellow']);

    const { count: normalCount } = await client
      .from('follow_up_plans')
      .select('*', { count: 'exact', head: true })
      .eq('urgency_level', 'green');

    res.json({
      totalCustomers: totalCustomers || 0,
      todayPending: (urgentCount || 0) + (todayCount || 0),
      weekPending: weekCount || 0,
      highPriority: urgentCount || 0,
      urgentCount: urgentCount || 0,
      pendingCount: todayCount || 0,
      normalCount: normalCount || 0,
    });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// 标记客户已互动（重置2天计时器）
app.post('/api/v1/customers/:id/interact', async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { id } = req.params;
    const { interactionType = '微信关怀', notes = '' } = req.body;

    const { data: record, error: recordError } = await client
      .from('follow_up_records')
      .insert({
        customer_id: parseInt(id),
        content: notes || `${interactionType} - 客户已互动标记`,
        interaction_type: interactionType,
      })
      .select()
      .single();

    if (recordError) throw recordError;

    const { data: customer } = await client
      .from('customers')
      .select(`
        *,
        customer_tags (*),
        customer_profiles (*),
        follow_up_records (*)
      `)
      .eq('id', id)
      .maybeSingle();

    if (customer) {
      const priorityData = await calculateCustomerPriority(client, customer);
      
      await client
        .from('follow_up_plans')
        .upsert({
          customer_id: customer.id,
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
    }

    res.json({ 
      success: true, 
      message: '已标记客户互动，跟进计时器已重置',
      record 
    });
  } catch (error: any) {
    console.error('Error marking customer interaction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
