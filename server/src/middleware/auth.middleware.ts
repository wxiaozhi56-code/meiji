import express from 'express';
import { verifyToken, extractTokenFromHeader, UserRole } from '../utils/auth.utils';

/**
 * 扩展Request类型，添加user字段
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        storeId: number | null;
        role: string;
        name: string;
        phone: string;
      };
    }
  }
}

/**
 * 认证中间件 - 验证JWT token
 */
export function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = extractTokenFromHeader(req.headers.authorization);
  
  if (!token) {
    return res.status(401).json({ 
      success: false,
      error: '未登录或登录已过期，请重新登录' 
    });
  }
  
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ 
      success: false,
      error: '登录已过期，请重新登录' 
    });
  }
  
  req.user = decoded;
  next();
}

/**
 * 可选认证中间件 - 如果有token则验证，没有则跳过
 */
export function optionalAuthenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = extractTokenFromHeader(req.headers.authorization);
  
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }
  
  next();
}

/**
 * 角色权限验证中间件工厂函数
 */
export function requireRoles(...allowedRoles: string[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        error: '未登录' 
      });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false,
        error: '权限不足' 
      });
    }
    
    next();
  };
}

/**
 * 超级管理员权限验证
 */
export const requireSuperAdmin = requireRoles(UserRole.SUPER_ADMIN);

/**
 * 门店老板及以上权限验证
 */
export const requireStoreOwner = requireRoles(UserRole.SUPER_ADMIN, UserRole.STORE_OWNER);

/**
 * 门店店长及以上权限验证
 */
export const requireStoreManager = requireRoles(UserRole.SUPER_ADMIN, UserRole.STORE_OWNER, UserRole.STORE_MANAGER);

/**
 * 美容师及以上权限验证（所有角色）
 */
export const requireBeautician = requireRoles(
  UserRole.SUPER_ADMIN, 
  UserRole.STORE_OWNER, 
  UserRole.STORE_MANAGER, 
  UserRole.BEAUTICIAN
);

/**
 * 数据隔离中间件 - 自动注入store_id查询条件
 */
export function enforceDataIsolation(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.user) {
    return next();
  }
  
  // 超级管理员不做数据隔离
  if (req.user.role === UserRole.SUPER_ADMIN) {
    return next();
  }
  
  // 其他角色必须绑定门店
  if (!req.user.storeId) {
    return res.status(403).json({ 
      success: false,
      error: '账号未绑定门店' 
    });
  }
  
  next();
}
