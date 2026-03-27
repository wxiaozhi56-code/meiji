import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { createStyles } from './styles';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

// 跨平台提示函数
const showAlert = (title: string, message: string, buttons?: { text: string; style?: string; onPress?: () => void }[]) => {
  if (Platform.OS === 'web') {
    if (buttons && buttons.length > 1) {
      // 确认对话框
      if (window.confirm(`${title}\n${message}`)) {
        buttons[1].onPress?.();
      }
    } else {
      window.alert(`${title}\n${message}`);
      if (buttons && buttons.length > 0 && buttons[0].onPress) {
        buttons[0].onPress();
      }
    }
  } else {
    Alert.alert(title, message, buttons as any);
  }
};

// 角色名称映射
const ROLE_NAMES: Record<string, string> = {
  super_admin: '超级管理员',
  store_owner: '门店老板',
  store_manager: '门店店长',
  beautician: '美容师',
};

interface Customer {
  id: number;
  name: string;
  phone?: string;
  avatar?: string;
  customer_tags?: Array<{ tag_name: string }>;
  created_at?: string;
}

export default function HomeScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useSafeRouter();
  const { token, isAuthenticated, isLoading: authLoading, user, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // 检查认证状态
  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !isAuthenticated) {
        router.replace('/login');
      }
    }, [authLoading, isAuthenticated, router])
  );

  const fetchCustomers = useCallback(async () => {
    if (!token) return;
    
    try {
      /**
       * 服务端文件：server/src/routes/customer.routes.ts
       * 接口：GET /api/v1/customers
       * 需要认证：Bearer token
       */
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/customers`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        // 新API返回 { success: true, data: [...] }
        setCustomers(result.data || []);
      } else {
        console.error('Failed to fetch customers:', result.message || 'Unknown error');
        setCustomers([]);
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      // 等待认证状态加载完成
      if (authLoading) return;
      
      // 未登录则跳转到登录页
      if (!isAuthenticated) {
        router.replace('/login');
        return;
      }
      
      // 已登录则获取客户数据
      fetchCustomers();
    }, [authLoading, isAuthenticated, router, fetchCustomers])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchCustomers();
    setRefreshing(false);
  };

  const handleCustomerPress = (customerId: number) => {
    router.push('/customer-detail', { id: customerId });
  };

  const handleAddCustomer = () => {
    router.push('/add-customer');
  };

  const handleLogout = () => {
    showAlert(
      '退出登录',
      '确定要退出登录吗？',
      [
        { text: '取消', style: 'cancel' },
        { 
          text: '确定', 
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/login');
          }
        }
      ]
    );
  };

  const filteredCustomers = useMemo(() => {
    if (!searchQuery) return customers;
    return customers.filter(
      (c) =>
        c.name.includes(searchQuery) ||
        c.phone?.includes(searchQuery) ||
        c.customer_tags?.some((t) => t.tag_name.includes(searchQuery))
    );
  }, [customers, searchQuery]);

  const renderCustomerCard = (customer: Customer) => {
    const tags = customer.customer_tags?.map((t) => t.tag_name) || [];
    const lastFollowUp = customer.created_at?.split('T')[0];

    return (
      <TouchableOpacity
        key={customer.id}
        style={styles.customerCard}
        onPress={() => handleCustomerPress(customer.id)}
        activeOpacity={0.7}
      >
        <View style={styles.customerHeader}>
          <View style={styles.avatarContainer}>
            {customer.avatar ? (
              <Image source={{ uri: customer.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <ThemedText variant="h4" color={theme.primary}>
                  {customer.name.charAt(0)}
                </ThemedText>
              </View>
            )}
          </View>
          <View style={styles.customerInfo}>
            <ThemedText variant="title" color={theme.textPrimary}>
              {customer.name}
            </ThemedText>
            {customer.phone && (
              <ThemedText variant="small" color={theme.textMuted}>
                {customer.phone}
              </ThemedText>
            )}
          </View>
          <FontAwesome6 name="chevron-right" size={16} color={theme.textMuted} />
        </View>

        {tags.length > 0 && (
          <View style={styles.tagsContainer}>
            {tags.slice(0, 4).map((tag, index) => (
              <View key={index} style={styles.tag}>
                <ThemedText variant="tiny" color={theme.primary}>
                  {tag}
                </ThemedText>
              </View>
            ))}
          </View>
        )}

        {lastFollowUp && (
          <View style={styles.footer}>
            <FontAwesome6 name="clock" size={12} color={theme.textMuted} />
            <ThemedText variant="caption" color={theme.textMuted}>
              创建时间：{lastFollowUp}
            </ThemedText>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
      <ThemedView level="root" style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          {/* 用户信息行 */}
          <View style={styles.userInfoRow}>
            <View style={styles.userInfo}>
              <View style={styles.userAvatar}>
                <ThemedText variant="h4" color={theme.primary}>
                  {user?.name?.charAt(0) || '?'}
                </ThemedText>
              </View>
              <View>
                <ThemedText variant="title" color={theme.textPrimary}>
                  {user?.name || '用户'}
                </ThemedText>
                <ThemedText variant="caption" color={theme.textMuted}>
                  {ROLE_NAMES[user?.role || ''] || user?.role}
                </ThemedText>
              </View>
            </View>
            <View style={styles.headerActions}>
              {/* 员工管理入口 - 只有老板可见 */}
              {user?.role === 'store_owner' && (
                <TouchableOpacity 
                  style={styles.employeeButton} 
                  onPress={() => router.push('/employee-management')}
                >
                  <FontAwesome6 name="users-gear" size={18} color={theme.primary} />
                  <ThemedText variant="small" color={theme.primary}>员工</ThemedText>
                </TouchableOpacity>
              )}
              {/* 个人中心入口 */}
              <TouchableOpacity style={styles.profileButton} onPress={() => router.push('/profile')}>
                <FontAwesome6 name="user-circle" size={18} color={theme.textMuted} />
                <ThemedText variant="small" color={theme.textMuted}>我的</ThemedText>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.headerTop}>
            <View>
              <ThemedText variant="captionMedium" color={theme.textMuted}>
                美迹AI
              </ThemedText>
              <ThemedText variant="h2" color={theme.textPrimary}>
                客户管理
              </ThemedText>
            </View>
            <View style={styles.headerButtons}>
              <TouchableOpacity style={styles.headerButtonOutline} onPress={() => router.push('/dashboard')}>
                <FontAwesome6 name="tasks" size={18} color={theme.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerButton} onPress={handleAddCustomer}>
                <FontAwesome6 name="plus" size={20} color={theme.buttonPrimaryText} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <FontAwesome6 name="magnifying-glass" size={16} color={theme.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="搜索客户姓名、电话或标签"
              placeholderTextColor={theme.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {/* Customer List */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <ThemedText variant="h3" color={theme.primary}>
                {customers.length}
              </ThemedText>
              <ThemedText variant="caption" color={theme.textMuted}>
                总客户
              </ThemedText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <ThemedText variant="h3" color={theme.accent}>
                {filteredCustomers.length}
              </ThemedText>
              <ThemedText variant="caption" color={theme.textMuted}>
                筛选结果
              </ThemedText>
            </View>
          </View>

          <ThemedText variant="labelTitle" color={theme.textMuted}>
            客户列表
          </ThemedText>

          <View style={styles.customerList}>
            {filteredCustomers.map(renderCustomerCard)}
          </View>

          {filteredCustomers.length === 0 && !loading && (
            <View style={styles.emptyContainer}>
              <FontAwesome6 name="users" size={48} color={theme.textMuted} />
              <ThemedText variant="body" color={theme.textMuted}>
                暂无客户数据
              </ThemedText>
              <TouchableOpacity style={styles.addButton} onPress={handleAddCustomer}>
                <ThemedText variant="smallMedium" color={theme.buttonPrimaryText}>
                  添加第一个客户
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </ThemedView>
    </Screen>
  );
}
