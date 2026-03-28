import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { FontAwesome5, FontAwesome6 } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Spacing } from '@/constants/theme';
import { createStyles } from './styles';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

interface FollowUpPlan {
  id: number;
  customer_id: number;
  priority: number;
  suggested_action: string;
  suggested_timing: string;
  reason: string;
  last_contact_days: number;
  urgency_level?: 'red' | 'yellow' | 'green';
  recommended_topics?: string[];
  communication_style?: string;
  best_time_slot?: string;
  customers: {
    id: number;
    name: string;
    phone?: string;
    customer_tags?: Array<{ tag_name: string }>;
  };
}

interface Stats {
  totalCustomers: number;
  todayPending: number;
  weekPending: number;
  highPriority: number;
  urgentCount: number; // 红色 - 超过3天
  pendingCount: number; // 黄色 - 超过2天
  normalCount: number; // 绿色 - 正常
}

export default function DashboardScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useSafeRouter();
  const { token, isAuthenticated, isLoading: authLoading } = useAuth();

  const [plans, setPlans] = useState<FollowUpPlan[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'today' | 'week' | 'all'>('today');
  
  // 使用 ref 跟踪当前 filter 和请求状态，避免依赖循环
  const activeFilterRef = useRef(activeFilter);
  const isFetchingRef = useRef(false);
  activeFilterRef.current = activeFilter;

  // 获取数据 - 不依赖 activeFilter，使用 ref 获取当前值
  const fetchData = useCallback(async (showLoading = false) => {
    if (!token || isFetchingRef.current) return;

    isFetchingRef.current = true;
    if (showLoading) setLoading(true);
    
    try {
      // 先计算跟进计划
      await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/follow-up-plans/calculate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      // 获取统计数据
      const statsRes = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/follow-up-plans/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const statsData = await statsRes.json();
      setStats(statsData);

      // 获取待跟进列表 - 使用 ref 获取当前 filter
      const currentFilter = activeFilterRef.current;
      const timing = currentFilter === 'today' ? 'today' : currentFilter === 'week' ? 'this_week' : '';
      const plansRes = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/follow-up-plans${timing ? `?timing=${timing}` : ''}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const plansData = await plansRes.json();
      setPlans(plansData);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFetchingRef.current = false;
    }
  }, [token]); // 不再依赖 activeFilter

  // 认证检查
  useFocusEffect(
    useCallback(() => {
      if (authLoading) return;
      if (!isAuthenticated) {
        router.replace('/login');
      }
    }, [authLoading, isAuthenticated, router])
  );

  // 数据获取 - 仅在页面焦点变化时触发
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated && token) {
        fetchData(true);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated, token])
  );

  // 当 activeFilter 变化时重新获取数据（不显示loading）
  useEffect(() => {
    // 跳过首次渲染，避免重复请求
    if (isAuthenticated && token && !loading) {
      fetchData(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleCustomerPress = (customerId: number) => {
    router.push('/customer-detail', { id: customerId });
  };

  const getUrgencyColor = (urgencyLevel?: 'red' | 'yellow' | 'green') => {
    switch (urgencyLevel) {
      case 'red': return theme.error;
      case 'yellow': return '#FF9500';
      case 'green': return theme.success;
      default: return theme.textMuted;
    }
  };

  const getUrgencyLabel = (urgencyLevel?: 'red' | 'yellow' | 'green') => {
    switch (urgencyLevel) {
      case 'red': return '紧急';
      case 'yellow': return '待跟进';
      case 'green': return '正常';
      default: return '一般';
    }
  };

  const getPriorityColor = (priority: number) => {
    if (priority >= 80) return theme.error;
    if (priority >= 60) return '#FF9500';
    if (priority >= 40) return theme.accent;
    return theme.textMuted;
  };

  const getPriorityLabel = (priority: number) => {
    if (priority >= 80) return '紧急';
    if (priority >= 60) return '重要';
    if (priority >= 40) return '一般';
    return '较低';
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case '电话': return 'phone';
      case '微信关怀': return 'comments';
      case '项目推荐': return 'gift';
      case '活动邀约': return 'calendar-check';
      default: return 'handshake';
    }
  };

  if (loading) {
    return (
      <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
        <ThemedView level="root" style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </ThemedView>
      </Screen>
    );
  }

  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
      <ThemedView level="root" style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <ThemedText variant="h2" color={theme.textPrimary}>
            跟进仪表盘
          </ThemedText>
          <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
            <FontAwesome6 name="rotate" size={18} color={theme.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Stats Cards */}
          {stats && (
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, styles.statCardHighlight]}>
                <ThemedText variant="h1" color={theme.buttonPrimaryText}>
                  {stats.todayPending}
                </ThemedText>
                <ThemedText variant="small" color={theme.buttonPrimaryText}>
                  今日待跟进
                </ThemedText>
                <View style={styles.statBreakdown}>
                  {stats.urgentCount > 0 && (
                    <View style={[styles.breakdownDot, { backgroundColor: theme.error }]} />
                  )}
                  {stats.pendingCount > 0 && (
                    <View style={[styles.breakdownDot, { backgroundColor: '#FF9500' }]} />
                  )}
                </View>
              </View>
              <View style={styles.statCard}>
                <ThemedText variant="h2" color={theme.textPrimary}>
                  {stats.normalCount}
                </ThemedText>
                <ThemedText variant="small" color={theme.textMuted}>
                  跟进正常
                </ThemedText>
                <View style={styles.statBreakdown}>
                  <View style={[styles.breakdownDot, { backgroundColor: theme.success }]} />
                </View>
              </View>
              <View style={styles.statCard}>
                <ThemedText variant="h2" color={theme.textPrimary}>
                  {stats.totalCustomers}
                </ThemedText>
                <ThemedText variant="small" color={theme.textMuted}>
                  客户总数
                </ThemedText>
              </View>
            </View>
          )}

          {/* Filter Tabs */}
          <View style={styles.filterContainer}>
            {[
              { key: 'today', label: '今天' },
              { key: 'week', label: '本周' },
              { key: 'all', label: '全部' },
            ].map((filter) => (
              <TouchableOpacity
                key={filter.key}
                style={[styles.filterTab, activeFilter === filter.key && styles.filterTabActive]}
                onPress={() => setActiveFilter(filter.key as any)}
              >
                <ThemedText
                  variant="smallMedium"
                  color={activeFilter === filter.key ? theme.buttonPrimaryText : theme.textMuted}
                >
                  {filter.label}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          {/* Plans List */}
          <View style={styles.section}>
            <ThemedText variant="title" color={theme.textPrimary}>
              待跟进客户
            </ThemedText>

            {plans.length === 0 ? (
              <View style={styles.emptyState}>
                <FontAwesome6 name="check-circle" size={48} color={theme.textMuted} />
                <ThemedText variant="body" color={theme.textMuted}>
                  暂无待跟进客户
                </ThemedText>
              </View>
            ) : (
              plans.map((plan) => (
                <TouchableOpacity
                  key={plan.id}
                  style={[
                    styles.planCard,
                    { borderLeftColor: getUrgencyColor(plan.urgency_level), borderLeftWidth: 4 }
                  ]}
                  onPress={() => handleCustomerPress(plan.customers.id)}
                >
                  <View style={styles.planHeader}>
                    <View style={styles.planInfo}>
                      <View style={styles.planNameRow}>
                        <ThemedText variant="h4" color={theme.textPrimary}>
                          {plan.customers.name}
                        </ThemedText>
                        <View style={[styles.urgencyBadge, { backgroundColor: getUrgencyColor(plan.urgency_level) }]}>
                          <ThemedText variant="tiny" color={theme.buttonPrimaryText}>
                            {getUrgencyLabel(plan.urgency_level)}
                          </ThemedText>
                        </View>
                      </View>
                      <View style={styles.planMeta}>
                        <ThemedText variant="caption" color={theme.textMuted}>
                          {plan.suggested_timing}
                        </ThemedText>
                      </View>
                    </View>
                    <View style={styles.actionBadge}>
                      <FontAwesome5 name={getActionIcon(plan.suggested_action)} size={14} color={theme.primary} />
                    </View>
                  </View>

                  <View style={styles.planBody}>
                    <View style={styles.planReason}>
                      <FontAwesome6 name="lightbulb" size={14} color={theme.accent} />
                      <ThemedText variant="small" color={theme.textSecondary}>
                        {plan.reason}
                      </ThemedText>
                    </View>
                    <View style={styles.planDetails}>
                      <ThemedText variant="caption" color={theme.textMuted}>
                        上次跟进：{plan.last_contact_days >= 999 ? '暂无记录' : `${plan.last_contact_days}天前`}
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.textMuted}>
                        · {plan.suggested_action}
                      </ThemedText>
                    </View>
                  </View>

                  {/* AI智能建议区域 */}
                  {(plan.recommended_topics || plan.communication_style || plan.best_time_slot) && (
                    <View style={styles.aiSuggestionSection}>
                      <View style={styles.aiSuggestionHeader}>
                        <View style={styles.aiSuggestionIcon}>
                          <FontAwesome6 name="robot" size={10} color={theme.primary} />
                        </View>
                        <ThemedText variant="smallMedium" color={theme.primary}>
                          AI 智能建议
                        </ThemedText>
                      </View>
                      
                      {/* 推荐话题 */}
                      {plan.recommended_topics && plan.recommended_topics.length > 0 && (
                        <View style={{ marginBottom: Spacing.xs }}>
                          <ThemedText variant="caption" color={theme.textMuted} style={{ marginBottom: 4 }}>
                            推荐话题：
                          </ThemedText>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                            {plan.recommended_topics.map((topic, index) => (
                              <View key={index} style={styles.topicTag}>
                                <ThemedText variant="tiny" color={theme.buttonPrimaryText}>
                                  {topic}
                                </ThemedText>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}
                      
                      {/* 沟通风格 */}
                      {plan.communication_style && (
                        <View style={styles.aiSuggestionItem}>
                          <FontAwesome5 name="comments" size={12} color={theme.textSecondary} />
                          <ThemedText variant="small" color={theme.textSecondary}>
                            沟通风格：{plan.communication_style}
                          </ThemedText>
                        </View>
                      )}
                      
                      {/* 最佳时间段 */}
                      {plan.best_time_slot && (
                        <View style={styles.aiSuggestionItem}>
                          <FontAwesome5 name="clock" size={12} color={theme.textSecondary} />
                          <ThemedText variant="small" color={theme.textSecondary}>
                            最佳联系时间：{plan.best_time_slot}
                          </ThemedText>
                        </View>
                      )}
                    </View>
                  )}

                  {plan.customers.customer_tags && plan.customers.customer_tags.length > 0 && (
                    <View style={styles.planTags}>
                      {plan.customers.customer_tags.slice(0, 3).map((tag, index) => (
                        <View key={index} style={styles.miniTag}>
                          <ThemedText variant="tiny" color={theme.primary}>
                            {tag.tag_name}
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      </ThemedView>
    </Screen>
  );
}
