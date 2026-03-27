import { Router } from 'express';
import { getSupabaseClient } from '../storage/database/supabase-client';
import { authenticate, enforceDataIsolation, requireStoreOwner } from '../middleware/auth.middleware';
import { UserRole } from '../utils/auth.utils';

const router = Router();

/**
 * 获取门店员工列表
 * GET /api/v1/employees
 */
router.get('/', authenticate, enforceDataIsolation, requireStoreOwner, async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { storeId } = req.user!;

    const { data: employees, error } = await client
      .from('users')
      .select('id, name, phone, role, status, created_at, last_login_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: employees,
    });
  } catch (error: any) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建员工账号
 * POST /api/v1/employees
 */
router.post('/', authenticate, enforceDataIsolation, requireStoreOwner, async (req, res) => {
  try {
    const { name, phone, password, role } = req.body;
    const { storeId } = req.user!;

    // 参数校验
    if (!name || !phone || !password || !role) {
      return res.status(400).json({ 
        success: false,
        error: '缺少必填字段：姓名、手机号、密码、角色' 
      });
    }

    // 角色校验（只能创建店长或美容师）
    if (![UserRole.STORE_MANAGER, UserRole.BEAUTICIAN].includes(role as UserRole)) {
      return res.status(400).json({ 
        success: false,
        error: '只能创建店长或美容师账号' 
      });
    }

    // 手机号格式校验
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ 
        success: false,
        error: '手机号格式不正确' 
      });
    }

    // 密码强度校验
    if (password.length < 6) {
      return res.status(400).json({ 
        success: false,
        error: '密码长度至少6位' 
      });
    }

    const client = getSupabaseClient();

    // 检查手机号是否已注册
    const { data: existingUser } = await client
      .from('users')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        error: '该手机号已注册' 
      });
    }

    // 加密密码
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 10);

    // 创建员工账号（自动绑定到当前门店）
    const { data: user, error } = await client
      .from('users')
      .insert({
        store_id: storeId,  // 关键：自动绑定到老板的门店
        role,
        name,
        phone,
        password_hash: passwordHash,
        status: 'active',
      })
      .select('id, name, phone, role, status, created_at')
      .single();

    if (error || !user) {
      throw new Error('创建员工账号失败');
    }

    res.status(201).json({
      success: true,
      message: '员工账号创建成功',
      data: user,
    });
  } catch (error: any) {
    console.error('Error creating employee:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 更新员工状态（启用/禁用）
 * PUT /api/v1/employees/:id/status
 */
router.put('/:id/status', authenticate, enforceDataIsolation, requireStoreOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const { storeId } = req.user!;

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ 
        success: false,
        error: '状态值无效' 
      });
    }

    const client = getSupabaseClient();

    // 验证员工属于当前门店
    const { data: employee } = await client
      .from('users')
      .select('id, role')
      .eq('id', id)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!employee) {
      return res.status(404).json({ 
        success: false,
        error: '员工不存在' 
      });
    }

    // 不能修改自己的状态
    if (parseInt(id) === req.user!.userId) {
      return res.status(400).json({ 
        success: false,
        error: '不能修改自己的状态' 
      });
    }

    const { error } = await client
      .from('users')
      .update({ status })
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: status === 'active' ? '员工已启用' : '员工已禁用',
    });
  } catch (error: any) {
    console.error('Error updating employee status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除员工
 * DELETE /api/v1/employees/:id
 */
router.delete('/:id', authenticate, enforceDataIsolation, requireStoreOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const { storeId } = req.user!;

    const client = getSupabaseClient();

    // 验证员工属于当前门店
    const { data: employee } = await client
      .from('users')
      .select('id, role')
      .eq('id', id)
      .eq('store_id', storeId)
      .maybeSingle();

    if (!employee) {
      return res.status(404).json({ 
        success: false,
        error: '员工不存在' 
      });
    }

    // 不能删除自己
    if (parseInt(id) === req.user!.userId) {
      return res.status(400).json({ 
        success: false,
        error: '不能删除自己的账号' 
      });
    }

    const { error } = await client
      .from('users')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: '员工已删除',
    });
  } catch (error: any) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
