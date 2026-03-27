import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'meiji-ai-secret-key-2024';
const JWT_EXPIRES_IN = '7d'; // 7天过期
const BCRYPT_SALT_ROUNDS = 10;

interface UserPayload {
  id: number;
  store_id: number | null;
  role: string;
  name: string;
  phone: string;
}

/**
 * 密码加密
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * 密码验证
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * 生成JWT token
 */
export function generateToken(user: UserPayload): string {
  const payload = {
    userId: user.id,
    storeId: user.store_id,
    role: user.role,
    name: user.name,
    phone: user.phone,
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * 验证JWT token
 */
export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * 从请求头中提取token
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7); // 移除 "Bearer " 前缀
}

/**
 * 用户角色枚举
 */
export enum UserRole {
  SUPER_ADMIN = 'super_admin',      // 超级管理员
  STORE_OWNER = 'store_owner',      // 门店老板
  STORE_MANAGER = 'store_manager',  // 门店店长
  BEAUTICIAN = 'beautician',        // 美容师
}

/**
 * 角色权限配置
 */
export const ROLE_PERMISSIONS = {
  [UserRole.SUPER_ADMIN]: {
    canManageAllStores: true,
    canManageAllUsers: true,
    canViewAllData: true,
    canManagePackages: true,
  },
  [UserRole.STORE_OWNER]: {
    canManageStore: true,
    canManageStoreUsers: true,
    canViewStoreData: true,
    canAssignCustomers: true,
  },
  [UserRole.STORE_MANAGER]: {
    canManageStoreUsers: false,
    canViewStoreData: true,
    canAssignCustomers: true,
  },
  [UserRole.BEAUTICIAN]: {
    canViewOwnCustomers: true,
    canCreateFollowUp: true,
    canGenerateMessage: true,
  },
};

/**
 * 检查用户是否有权限访问指定门店的数据
 */
export function canAccessStore(userRole: string, userStoreId: number | null, targetStoreId: number): boolean {
  // 超级管理员可以访问所有门店
  if (userRole === UserRole.SUPER_ADMIN) {
    return true;
  }
  
  // 其他角色只能访问自己门店
  return userStoreId === targetStoreId;
}

/**
 * 检查用户是否有权限访问指定客户的数据
 */
export function canAccessCustomer(
  userRole: string,
  userStoreId: number | null,
  userId: number,
  customerStoreId: number,
  customerResponsibleUserId: number | null
): boolean {
  // 超级管理员可以访问所有客户
  if (userRole === UserRole.SUPER_ADMIN) {
    return true;
  }
  
  // 检查门店权限
  if (userStoreId !== customerStoreId) {
    return false;
  }
  
  // 门店老板和店长可以访问本店所有客户
  if (userRole === UserRole.STORE_OWNER || userRole === UserRole.STORE_MANAGER) {
    return true;
  }
  
  // 美容师只能访问自己负责的客户
  return customerResponsibleUserId === userId;
}
