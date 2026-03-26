import React, { useState, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  RefreshControl,
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useTheme } from '@/hooks/useTheme';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { createStyles } from './styles';

interface Customer {
  id: number;
  name: string;
  phone?: string;
  avatar?: string;
  tags: string[];
  lastFollowUp?: string;
}

// Mock data for demo
const MOCK_CUSTOMERS: Customer[] = [
  {
    id: 1,
    name: '张女士',
    phone: '138****1234',
    tags: ['#女儿中考', '#失眠', '#皮肤干燥'],
    lastFollowUp: '2024-01-15',
  },
  {
    id: 2,
    name: '李姐',
    phone: '139****5678',
    tags: ['#新客户', '#抗衰需求'],
    lastFollowUp: '2024-01-14',
  },
  {
    id: 3,
    name: '王女士',
    phone: '137****9012',
    tags: ['#常客', '#补水项目'],
    lastFollowUp: '2024-01-13',
  },
];

export default function HomeScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useSafeRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [customers] = useState<Customer[]>(MOCK_CUSTOMERS);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery) return customers;
    return customers.filter(
      (c) =>
        c.name.includes(searchQuery) ||
        c.phone?.includes(searchQuery) ||
        c.tags.some((t) => t.includes(searchQuery))
    );
  }, [customers, searchQuery]);

  const handleRefresh = async () => {
    setRefreshing(true);
    // 从 API 获取真实数据
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  const handleCustomerPress = (customerId: number) => {
    router.push('/customer-detail', { id: customerId });
  };

  const handleAddCustomer = () => {
    router.push('/voice-input');
  };

  const renderCustomerCard = (customer: Customer) => (
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
          <ThemedText variant="small" color={theme.textMuted}>
            {customer.phone}
          </ThemedText>
        </View>
        <FontAwesome6 name="chevron-right" size={16} color={theme.textMuted} />
      </View>

      <View style={styles.tagsContainer}>
        {customer.tags.map((tag, index) => (
          <View key={index} style={styles.tag}>
            <ThemedText variant="tiny" color={theme.primary}>
              {tag}
            </ThemedText>
          </View>
        ))}
      </View>

      {customer.lastFollowUp && (
        <View style={styles.footer}>
          <FontAwesome6 name="clock" size={12} color={theme.textMuted} />
          <ThemedText variant="caption" color={theme.textMuted}>
            上次跟进：{customer.lastFollowUp}
          </ThemedText>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
      <ThemedView level="root" style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <ThemedText variant="captionMedium" color={theme.textMuted}>
                美迹AI
              </ThemedText>
              <ThemedText variant="h2" color={theme.textPrimary}>
                客户管理
              </ThemedText>
            </View>
            <TouchableOpacity style={styles.headerButton} onPress={handleAddCustomer}>
              <FontAwesome6 name="plus" size={20} color={theme.buttonPrimaryText} />
            </TouchableOpacity>
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
              <ThemedText variant="h3" color={theme.primary}>
                3
              </ThemedText>
              <ThemedText variant="caption" color={theme.textMuted}>
                今日跟进
              </ThemedText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <ThemedText variant="h3" color={theme.accent}>
                5
              </ThemedText>
              <ThemedText variant="caption" color={theme.textMuted}>
                待跟进
              </ThemedText>
            </View>
          </View>

          <ThemedText variant="labelTitle" color={theme.textMuted}>
            客户列表
          </ThemedText>

          <View style={styles.customerList}>
            {filteredCustomers.map(renderCustomerCard)}
          </View>

          {filteredCustomers.length === 0 && (
            <View style={styles.emptyContainer}>
              <FontAwesome6 name="users" size={48} color={theme.textMuted} />
              <ThemedText variant="body" color={theme.textMuted}>
                暂无客户数据
              </ThemedText>
            </View>
          )}
        </ScrollView>
      </ThemedView>
    </Screen>
  );
}
