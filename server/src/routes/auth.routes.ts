import { Router } from 'express';
import { getSupabaseClient } from '../storage/database/supabase-client';
import { hashPassword, comparePassword, generateToken, UserRole } from '../utils/auth.utils';
import { authenticate, requireStoreOwner, requireSuperAdmin } from '../middleware/auth.middleware';

const router = Router();

/**
 * 超级管理员创建门店老板账号
 * POST /api/v1/auth/admin/create-store-owner
 * 
 * 只有超级管理员可以调用此接口
 */
router.post('/admin/create-store-owner', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { storeName, ownerPhone, password, ownerName, address } = req.body;

    // 参数校验
    if (!storeName || !ownerPhone || !password || !ownerName) {
      return res.status(400).json({ 
        success: false,
        error: '缺少必填字段：门店名称、老板手机号、密码、老板姓名' 
      });
    }

    // 手机号格式校验
    if (!/^1[3-9]\d{9}$/.test(ownerPhone)) {
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
      .eq('phone', ownerPhone)
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        error: '该手机号已注册' 
      });
    }

    // 加密密码
    const passwordHash = await hashPassword(password);

    // 创建门店
    const { data: store, error: storeError } = await client
      .from('stores')
      .insert({
        name: storeName,
        owner_phone: ownerPhone,
        address: address || null,
        package_type: 'basic',
        status: 'active',
      })
      .select()
      .single();

    if (storeError) {
      console.error('Store creation error:', storeError);
      throw new Error(`创建门店失败: ${storeError.message}`);
    }
    
    if (!store) {
      throw new Error('创建门店失败：未返回数据');
    }

    // 创建老板账号
    const { data: user, error: userError } = await client
      .from('users')
      .insert({
        store_id: store.id,
        role: UserRole.STORE_OWNER,
        name: ownerName,
        phone: ownerPhone,
        password_hash: passwordHash,
        status: 'active',
      })
      .select()
      .single();

    if (userError || !user) {
      // 回滚门店创建
      await client.from('stores').delete().eq('id', store.id);
      throw new Error('创建账号失败');
    }

    res.status(201).json({
      success: true,
      message: '门店老板账号创建成功',
      data: {
        store: {
          id: store.id,
          name: store.name,
        },
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          role: user.role,
        },
      },
    });
  } catch (error: any) {
    console.error('Create store owner error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || '创建失败，请重试' 
    });
  }
});

/**
 * 员工账号注册（门店老板创建）
 * POST /api/v1/auth/register/employee
 */
router.post('/register/employee', authenticate, requireStoreOwner, async (req, res) => {
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
    const passwordHash = await hashPassword(password);

    // 创建员工账号
    const { data: user, error } = await client
      .from('users')
      .insert({
        store_id: storeId,
        role,
        name,
        phone,
        password_hash: passwordHash,
        status: 'active',
      })
      .select()
      .single();

    if (error || !user) {
      throw new Error('创建员工账号失败');
    }

    res.status(201).json({
      success: true,
      message: '员工账号创建成功',
      data: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error: any) {
    console.error('Employee registration error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || '创建失败，请重试' 
    });
  }
});

/**
 * 登录接口
 * POST /api/v1/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ 
        success: false,
        error: '请输入手机号和密码' 
      });
    }

    const client = getSupabaseClient();

    // 查找用户
    const { data: user, error } = await client
      .from('users')
      .select(`
        *,
        stores (
          id,
          name,
          package_type,
          status
        )
      `)
      .eq('phone', phone)
      .maybeSingle();

    if (error || !user) {
      return res.status(401).json({ 
        success: false,
        error: '手机号或密码错误' 
      });
    }

    // 检查账号状态
    if (user.status !== 'active') {
      return res.status(403).json({ 
        success: false,
        error: '账号已被禁用，请联系管理员' 
      });
    }

    // 验证密码
    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false,
        error: '手机号或密码错误' 
      });
    }

    // 更新最后登录时间
    await client
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    // 生成token
    const token = generateToken(user);

    res.json({
      success: true,
      message: '登录成功',
      data: {
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          role: user.role,
          storeId: user.store_id,
          storeName: user.stores?.name,
        },
        token,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      error: '登录失败，请重试' 
    });
  }
});

/**
 * 获取当前用户信息
 * GET /api/v1/auth/me
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const client = getSupabaseClient();
    const { userId } = req.user!;

    const { data: user, error } = await client
      .from('users')
      .select(`
        id,
        name,
        phone,
        role,
        status,
        created_at,
        stores (
          id,
          name,
          package_type,
          status
        )
      `)
      .eq('id', userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ 
        success: false,
        error: '用户不存在' 
      });
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        status: user.status,
        createdAt: user.created_at,
        store: user.stores,
      },
    });
  } catch (error: any) {
    console.error('Get user info error:', error);
    res.status(500).json({ 
      success: false,
      error: '获取用户信息失败' 
    });
  }
});

/**
 * 修改密码
 * PUT /api/v1/auth/password
 */
router.put('/password', authenticate, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const { userId } = req.user!;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ 
        success: false,
        error: '请输入旧密码和新密码' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false,
        error: '新密码长度至少6位' 
      });
    }

    const client = getSupabaseClient();

    // 获取用户当前密码
    const { data: user, error: fetchError } = await client
      .from('users')
      .select('password_hash')
      .eq('id', userId)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({ 
        success: false,
        error: '用户不存在' 
      });
    }

    // 验证旧密码
    const isValid = await comparePassword(oldPassword, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ 
        success: false,
        error: '旧密码错误' 
      });
    }

    // 加密新密码
    const newPasswordHash = await hashPassword(newPassword);

    // 更新密码
    const { error: updateError } = await client
      .from('users')
      .update({ password_hash: newPasswordHash })
      .eq('id', userId);

    if (updateError) {
      throw new Error('密码更新失败');
    }

    res.json({
      success: true,
      message: '密码修改成功',
    });
  } catch (error: any) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || '密码修改失败，请重试' 
    });
  }
});

export default router;
