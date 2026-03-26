import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { FontAwesome5, FontAwesome6 } from '@expo/vector-icons';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useTheme } from '@/hooks/useTheme';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
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

  const [plans, setPlans] = useState<FollowUpPlan[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'today' | 'week' | 'all'>('today');

  useEffect(() => {
    fetchData();
  }, [activeFilter]);

  const fetchData = async () => {
    try {
      // 先计算跟进计划
      await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/follow-up-plans/calculate`, {
        method: 'POST',
      });

      // 获取统计数据
      const statsRes = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/follow-up-plans/stats`);
      const statsData = await statsRes.json();
      setStats(statsData);

      // 获取待跟进列表
      const timing = activeFilter === 'today' ? 'today' : activeFilter === 'week' ? 'this_week' : '';
      const plansRes = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/follow-up-plans${timing ? `?timing=${timing}` : ''}`);
      const plansData = await plansRes.json();
      setPlans(plansData);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

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
