import React, { useState, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Pressable,
  TextInput,
} from 'react-native';
import { FontAwesome5, FontAwesome6 } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { Spacing } from '@/constants/theme';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { createStyles } from './styles';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

// 计算距离今天的天数
const getDaysDiff = (dateStr: string): number => {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - date.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

// 格式化天数显示
const formatDaysDiff = (days: number): { text: string; color: string } => {
  if (days === 0) return { text: '今天', color: '#10B981' };
  if (days === 1) return { text: '昨天', color: '#3B82F6' };
  if (days <= 7) return { text: `${days}天前`, color: '#3B82F6' };
  if (days <= 30) return { text: `${days}天前`, color: '#F59E0B' };
  return { text: `${days}天前`, color: '#EF4444' }; // 超过30天显示红色
};

interface CustomerProfile {
  id: number;
  field_name: string;
  field_value: string;
}

interface Customer {
  id: number;
  name: string;
  phone?: string;
  avatar?: string;
  customer_tags?: Array<{ id: number; tag_name: string; category: string }>;
  customer_profiles?: CustomerProfile[];
  follow_up_records?: Array<{ id: number; created_at: string; content: string; audio_url?: string }>;
  ai_briefs?: Array<{ id: number; summary: string; suggestions: any; follow_up_record_id?: number }>;
  generated_messages?: Array<{ id: number; type: string; content: string; follow_up_record_id?: number }>;
  last_follow_up_at?: string; // 最后跟进时间
  responsible_user_id?: number; // 负责人ID
  responsible_user?: { id: number; name: string; phone: string }; // 负责人信息
}

export default function CustomerDetailScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useSafeRouter();
  const params = useSafeSearchParams<{ id: number }>();
  const { token, user } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  // 客户资料编辑状态
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileFieldName, setProfileFieldName] = useState('');
  const [profileFieldValue, setProfileFieldValue] = useState('');
  const [editingProfile, setEditingProfile] = useState<CustomerProfile | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  
  // 客户分配状态
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [employees, setEmployees] = useState<Array<{ id: number; name: string; phone: string; role: string }>>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [assigning, setAssigning] = useState(false);
  
  // 标签管理状态
  const [showTagModal, setShowTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<Array<{ name: string; category: string }>>([]);
  const [addingTag, setAddingTag] = useState(false);
  const [deletingTagId, setDeletingTagId] = useState<number | null>(null);

  React.useEffect(() => {
    fetchCustomer();
  }, [params.id]);

  const fetchCustomer = async () => {
    if (!params.id || !token) return;
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/customers/${params.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const result = await response.json();
      
      if (response.ok && result.success) {
        setCustomer(result.data);
      } else {
        console.error('Failed to fetch customer:', result.message);
      }
    } catch (error) {
      console.error('Failed to fetch customer:', error);
    } finally {
      setLoading(false);
    }
  };

  // 获取员工列表（用于分配客户）
  const fetchEmployees = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/stores/employees`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setEmployees(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    }
  };

  // 分配客户
  const handleAssign = async () => {
    if (!customer || !selectedEmployeeId || !token) {
      Toast.show({
        type: 'error',
        text1: '请选择美容师',
      });
      return;
    }

    setAssigning(true);
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/stores/customers/${customer.id}/assign`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          responsibleUserId: selectedEmployeeId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || '分配失败');
      }

      Toast.show({
        type: 'success',
        text1: '分配成功',
        text2: data.message,
      });

      setShowAssignModal(false);
      fetchCustomer(); // 刷新数据
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: '分配失败',
        text2: error.message,
      });
    } finally {
      setAssigning(false);
    }
  };

  // 打开分配Modal
  const handleOpenAssignModal = () => {
    if (!customer) return;
    fetchEmployees();
    setSelectedEmployeeId(customer.responsible_user_id || null);
    setShowAssignModal(true);
  };

  // 获取标签建议
  const fetchTagSuggestions = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/customers/tag-suggestions`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setTagSuggestions(data.data.presetTags || []);
      }
    } catch (error) {
      console.error('Failed to fetch tag suggestions:', error);
    }
  };

  // 打开添加标签Modal
  const handleOpenTagModal = () => {
    setNewTagName('');
    fetchTagSuggestions();
    setShowTagModal(true);
  };

  // 添加标签
  const handleAddTag = async (tagName?: string) => {
    if (!customer || !token) return;
    
    const nameToAdd = tagName || newTagName.trim();
    if (!nameToAdd) {
      Toast.show({ type: 'error', text1: '请输入标签名称' });
      return;
    }

    // 检查标签是否已存在
    if (customer.customer_tags?.some(t => t.tag_name === nameToAdd)) {
      Toast.show({ type: 'error', text1: '该标签已存在' });
      return;
    }

    setAddingTag(true);
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/customers/${customer.id}/tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ tagName: nameToAdd }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || '添加失败');
      }

      Toast.show({ type: 'success', text1: '标签已添加' });
      setShowTagModal(false);
      setNewTagName('');
      fetchCustomer(); // 刷新数据
    } catch (error: any) {
      Toast.show({ type: 'error', text1: '添加失败', text2: error.message });
    } finally {
      setAddingTag(false);
    }
  };

  // 删除标签
  const handleDeleteTag = async (tagId: number, tagName: string) => {
    if (!customer || !token) return;

    setDeletingTagId(tagId);
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/customers/${customer.id}/tags/${tagId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || '删除失败');
      }

      Toast.show({ type: 'success', text1: `已删除标签「${tagName}」` });
      fetchCustomer(); // 刷新数据
    } catch (error: any) {
      Toast.show({ type: 'error', text1: '删除失败', text2: error.message });
    } finally {
      setDeletingTagId(null);
    }
  };

  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  // 删除跟进记录
  const handleDeleteFollowUpRecord = async (recordId: number) => {
    if (!token) return;
    
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：DELETE /api/v1/follow-up-records/:id
       */
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/follow-up-records/${recordId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('删除失败');
      }

      Toast.show({
        type: 'success',
        text1: '跟进记录已删除',
      });

      fetchCustomer(); // 刷新数据
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: '删除失败',
        text2: error.message || '请重试',
      });
    }
  };

  // 添加/编辑资料
  const handleAddProfile = () => {
    setEditingProfile(null);
    setProfileFieldName('');
    setProfileFieldValue('');
    setShowProfileModal(true);
  };

  const handleEditProfile = (profile: CustomerProfile) => {
    setEditingProfile(profile);
    setProfileFieldName(profile.field_name);
    setProfileFieldValue(profile.field_value);
    setShowProfileModal(true);
  };

  const handleSaveProfile = async () => {
    if (!customer || !profileFieldName.trim() || !token) {
      Toast.show({
        type: 'error',
        text1: '请填写字段名称',
      });
      return;
    }

    setSavingProfile(true);
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/customer-profiles
       * Body 参数：customerId: number, fieldName: string, fieldValue: string
       */
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/customer-profiles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerId: customer.id,
          fieldName: profileFieldName.trim(),
          fieldValue: profileFieldValue.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('保存失败');
      }

      Toast.show({
        type: 'success',
        text1: editingProfile ? '资料已更新' : '资料已添加',
      });

      setShowProfileModal(false);
      fetchCustomer(); // 刷新数据
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: '保存失败',
        text2: error.message || '请重试',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteProfile = async (profileId: number) => {
    if (!token) return;
    
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/customer-profiles/${profileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('删除失败');
      }

      Toast.show({
        type: 'success',
        text1: '资料已删除',
      });

      fetchCustomer(); // 刷新数据
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: '删除失败',
        text2: error.message || '请重试',
      });
    }
  };

  const confirmDelete = async () => {
    if (!customer || !token) return;
    setShowDeleteModal(false);
    setDeleting(true);
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/customers/${customer.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('删除失败');
      }

      Toast.show({
        type: 'success',
        text1: '删除成功',
        text2: '客户已删除',
      });

      setTimeout(() => {
        router.back();
      }, 500);
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: '删除失败',
        text2: error.message || '请重试',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleStartRecord = () => {
    if (customer) {
      router.push('/voice-input', { customerId: customer.id });
    }
  };

  const handleOpenAnalysis = () => {
    if (customer) {
      router.push('/customer-analysis', { customerId: customer.id, customerName: customer.name });
    }
  };

  const handleGenerateMessages = (followUpRecordId?: number) => {
    if (customer) {
      router.push('/generate-messages', { 
        customerId: customer.id,
        followUpRecordId: followUpRecordId || ''
      });
    }
  };

  const handleCopyMessage = (content: string) => {
    console.log('Copy message:', content);
  };

  // 标记客户已互动
  const handleMarkInteracted = async (interactionType: string = '微信关怀') => {
    if (!customer) return;
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/customers/:id/interact
       * Body 参数：interactionType: string, notes?: string
       */
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/customers/${customer.id}/interact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interactionType }),
      });

      const data = await response.json();
      if (data.success) {
        Toast.show({
          type: 'success',
          text1: '已标记互动',
          text2: '跟进计时器已重置',
        });
        fetchCustomer();
      }
    } catch (error) {
      console.error('Failed to mark interaction:', error);
      Toast.show({
        type: 'error',
        text1: '操作失败',
      });
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

  if (!customer) {
    return (
      <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
        <ThemedView level="root" style={styles.loadingContainer}>
          <ThemedText variant="body" color={theme.textMuted}>客户不存在</ThemedText>
        </ThemedView>
      </Screen>
    );
  }

  const tags = customer.customer_tags || [];
  const profiles = customer.customer_profiles || [];
  const followUpHistory = customer.follow_up_records || [];
  const aiBriefs = customer.ai_briefs || [];
  const generatedMessages = customer.generated_messages || [];
  const latestBrief = aiBriefs[aiBriefs.length - 1];
  
  // 计算最后跟进时间
  const lastFollowUpDays = customer.last_follow_up_at ? getDaysDiff(customer.last_follow_up_at) : null;
  const lastFollowUpDisplay = lastFollowUpDays !== null ? formatDaysDiff(lastFollowUpDays) : null;

  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
      <ThemedView level="root" style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <FontAwesome6 name="arrow-left" size={20} color={theme.textPrimary} />
          </TouchableOpacity>
          <ThemedText variant="h3" color={theme.textPrimary}>
            客户详情
          </ThemedText>
          <View style={styles.headerButtons}>
            <TouchableOpacity onPress={handleOpenAnalysis} style={styles.analysisButton}>
              <FontAwesome6 name="chart-pie" size={18} color={theme.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleStartRecord} style={styles.recordButton}>
              <FontAwesome6 name="microphone" size={20} color={theme.buttonPrimaryText} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Customer Info Card */}
          <View style={styles.customerCard}>
            <View style={styles.customerHeader}>
              <View style={styles.avatarContainer}>
                {customer.avatar ? (
                  <Image source={{ uri: customer.avatar }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <ThemedText variant="h3" color={theme.primary}>
                      {customer.name.charAt(0)}
                    </ThemedText>
                  </View>
                )}
              </View>
              <View style={styles.customerInfo}>
                <ThemedText variant="h2" color={theme.textPrimary}>
                  {customer.name}
                </ThemedText>
                {customer.phone && (
                  <ThemedText variant="small" color={theme.textMuted}>
                    {customer.phone}
                  </ThemedText>
                )}
              </View>
            </View>

            {/* 标签区域 */}
            <View style={styles.tagsSection}>
              <View style={styles.tagsHeader}>
                <FontAwesome6 name="tags" size={14} color={theme.textMuted} />
                <ThemedText variant="small" color={theme.textMuted}>标签</ThemedText>
                <TouchableOpacity style={styles.addTagButton} onPress={handleOpenTagModal}>
                  <FontAwesome6 name="plus" size={12} color={theme.primary} />
                </TouchableOpacity>
              </View>
              
              {tags.length > 0 ? (
                <View style={styles.tagsContainer}>
                  {tags.map((tag) => (
                    <View key={tag.id} style={styles.tagItem}>
                      <ThemedText variant="tiny" color={theme.primary}>
                        {tag.tag_name}
                      </ThemedText>
                      <TouchableOpacity 
                        style={styles.tagDeleteButton}
                        onPress={() => handleDeleteTag(tag.id, tag.tag_name)}
                        disabled={deletingTagId === tag.id}
                      >
                        {deletingTagId === tag.id ? (
                          <ActivityIndicator size="small" color={theme.textMuted} />
                        ) : (
                          <FontAwesome6 name="xmark" size={10} color={theme.textMuted} />
                        )}
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : (
                <TouchableOpacity style={styles.addFirstTagButton} onPress={handleOpenTagModal}>
                  <FontAwesome6 name="plus" size={14} color={theme.primary} />
                  <ThemedText variant="small" color={theme.primary}>添加标签</ThemedText>
                </TouchableOpacity>
              )}
            </View>

            {/* 最后跟进时间 */}
            {lastFollowUpDisplay && (
              <View style={styles.lastFollowUpContainer}>
                <View style={styles.lastFollowUpInfo}>
                  <FontAwesome6 name="clock-rotate-left" size={16} color={lastFollowUpDisplay.color} />
                  <ThemedText variant="small" color={theme.textSecondary}>
                    最后跟进：<ThemedText variant="smallMedium" color={lastFollowUpDisplay.color}>{lastFollowUpDisplay.text}</ThemedText>
                  </ThemedText>
                </View>
                {lastFollowUpDays !== null && lastFollowUpDays > 7 && (
                  <View style={[styles.reminderBadge, lastFollowUpDays > 30 && styles.reminderBadgeUrgent]}>
                    <ThemedText variant="tiny" color={lastFollowUpDays > 30 ? '#FFFFFF' : lastFollowUpDisplay.color}>
                      {lastFollowUpDays > 30 ? '需关注' : '建议跟进'}
                    </ThemedText>
                  </View>
                )}
              </View>
            )}

            {/* 负责人信息 */}
            {customer.responsible_user && (
              <View style={styles.responsibleUserContainer}>
                <FontAwesome6 name="user-check" size={14} color={theme.textMuted} />
                <ThemedText variant="small" color={theme.textMuted}>
                  负责人：{customer.responsible_user.name}
                </ThemedText>
                {/* 分配按钮 - 只有老板和店长可见 */}
                {user?.role !== 'beautician' && (
                  <TouchableOpacity onPress={handleOpenAssignModal}>
                    <ThemedText variant="small" color={theme.primary}>更换</ThemedText>
                  </TouchableOpacity>
                )}
              </View>
            )}
            
            {/* 如果没有负责人，显示分配按钮 */}
            {!customer.responsible_user && user?.role !== 'beautician' && (
              <TouchableOpacity style={styles.assignButton} onPress={handleOpenAssignModal}>
                <FontAwesome6 name="user-plus" size={16} color={theme.primary} />
                <ThemedText variant="small" color={theme.primary}>分配负责人</ThemedText>
              </TouchableOpacity>
            )}

            {/* Quick Actions - 快捷操作 */}
            <View style={styles.quickActions}>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => handleMarkInteracted('微信关怀')}
              >
                <FontAwesome6 name="comments" size={16} color={theme.primary} />
                <ThemedText variant="tiny" color={theme.primary}>微信已联系</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => handleMarkInteracted('电话联系')}
              >
                <FontAwesome6 name="phone" size={16} color={theme.primary} />
                <ThemedText variant="tiny" color={theme.primary}>电话已联系</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => handleMarkInteracted('到店服务')}
              >
                <FontAwesome6 name="store" size={16} color={theme.primary} />
                <ThemedText variant="tiny" color={theme.primary}>已到店</ThemedText>
              </TouchableOpacity>
            </View>

            {/* Delete Button */}
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
              disabled={deleting}
            >
              <FontAwesome6 name="trash-can" size={16} color={theme.error} />
              <ThemedText variant="small" color={theme.error}>
                {deleting ? '删除中...' : '删除客户'}
              </ThemedText>
            </TouchableOpacity>
          </View>

          {/* Customer Profiles Section - 客户资料 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FontAwesome6 name="user-pen" size={20} color={theme.primary} />
              <ThemedText variant="title" color={theme.textPrimary}>
                客户资料
              </ThemedText>
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleAddProfile}
              >
                <FontAwesome6 name="plus" size={16} color={theme.buttonPrimaryText} />
              </TouchableOpacity>
            </View>
            
            {profiles.length > 0 ? (
              profiles.map((profile) => (
                <View key={profile.id} style={styles.profileItem}>
                  <View style={styles.profileContent}>
                    <ThemedText variant="smallMedium" color={theme.textMuted}>
                      {profile.field_name}
                    </ThemedText>
                    <ThemedText variant="body" color={theme.textPrimary}>
                      {profile.field_value || '未填写'}
                    </ThemedText>
                  </View>
                  <View style={styles.profileActions}>
                    <TouchableOpacity
                      onPress={() => handleEditProfile(profile)}
                      style={styles.profileActionButton}
                    >
                      <FontAwesome6 name="pen" size={14} color={theme.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteProfile(profile.id)}
                      style={styles.profileActionButton}
                    >
                      <FontAwesome6 name="trash" size={14} color={theme.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <ThemedText variant="small" color={theme.textMuted}>
                  暂无客户资料，点击右上角 + 添加
                </ThemedText>
              </View>
            )}
          </View>

          {/* AI Brief Section */}
          {latestBrief && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <FontAwesome6 name="brain" size={20} color={theme.accent} />
                <ThemedText variant="title" color={theme.textPrimary}>
                  AI客户简报
                </ThemedText>
              </View>
              <View style={styles.briefCard}>
                <ThemedText variant="body" color={theme.textPrimary}>
                  {latestBrief.summary}
                </ThemedText>
              </View>
            </View>
          )}

          {/* Follow-up History Section */}
          {followUpHistory.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <FontAwesome5 name="history" size={20} color={theme.accent} />
                <ThemedText variant="title" color={theme.textPrimary}>
                  跟进记录
                </ThemedText>
              </View>
              {followUpHistory.slice(-5).reverse().map((record) => {
                // 找出关联这条跟进记录的话术
                const relatedMessages = generatedMessages.filter(
                  msg => msg.follow_up_record_id === record.id
                );
                
                return (
                  <View key={record.id} style={styles.historyCard}>
                    <View style={styles.historyHeader}>
                      <ThemedText variant="caption" color={theme.textMuted}>
                        {record.created_at?.split('T')[0]}
                      </ThemedText>
                      <View style={styles.historyActions}>
                        <TouchableOpacity
                          style={styles.generateButtonSmall}
                          onPress={() => handleGenerateMessages(record.id)}
                        >
                          <FontAwesome6 name="wand-magic-sparkles" size={12} color={theme.buttonPrimaryText} />
                          <ThemedText variant="tiny" color={theme.buttonPrimaryText}>
                            生成话术
                          </ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.deleteRecordButton}
                          onPress={() => handleDeleteFollowUpRecord(record.id)}
                        >
                          <FontAwesome6 name="trash" size={14} color={theme.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <ThemedText variant="small" color={theme.textSecondary}>
                      {record.content}
                    </ThemedText>
                    
                    {/* 显示关联的话术 */}
                    {relatedMessages.length > 0 && (
                      <View style={styles.relatedMessages}>
                        {relatedMessages.map((msg) => (
                          <View key={msg.id} style={styles.relatedMessageItem}>
                            <View style={styles.messageTypeSmall}>
                              <ThemedText variant="tiny" color={theme.buttonPrimaryText}>
                                {msg.type}
                              </ThemedText>
                            </View>
                            <ThemedText variant="caption" color={theme.textPrimary}>
                              {msg.content}
                            </ThemedText>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Generated Messages Section - 保留未关联的话术 */}
          {generatedMessages.filter(msg => !msg.follow_up_record_id).length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <FontAwesome6 name="comment-dots" size={20} color={theme.accent} />
                <ThemedText variant="title" color={theme.textPrimary}>
                  其他智能话术
                </ThemedText>
              </View>
              {generatedMessages.filter(msg => !msg.follow_up_record_id).slice(-3).reverse().map((message) => (
                <View key={message.id} style={styles.messageCard}>
                  <View style={styles.messageHeader}>
                    <View style={styles.messageType}>
                      <ThemedText variant="tiny" color={theme.buttonPrimaryText}>
                        {message.type}
                      </ThemedText>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleCopyMessage(message.content)}
                      style={styles.copyButton}
                    >
                      <FontAwesome6 name="copy" size={14} color={theme.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <ThemedText variant="small" color={theme.textPrimary}>
                    {message.content}
                  </ThemedText>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Delete Confirmation Modal */}
        <Modal
          visible={showDeleteModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDeleteModal(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowDeleteModal(false)}>
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <ThemedText variant="h3" color={theme.textPrimary}>
                确认删除
              </ThemedText>
              <ThemedText variant="body" color={theme.textSecondary} style={styles.modalText}>
                确定要删除「{customer?.name}」吗？
              </ThemedText>
              <ThemedText variant="small" color={theme.textMuted}>
                此操作不可恢复，相关的标签、跟进记录等也将被删除。
              </ThemedText>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setShowDeleteModal(false)}
                >
                  <ThemedText variant="bodyMedium" color={theme.textPrimary}>
                    取消
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalDeleteButton}
                  onPress={confirmDelete}
                >
                  <ThemedText variant="bodyMedium" color={theme.buttonPrimaryText}>
                    删除
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Profile Edit Modal - 客户资料编辑 */}
        <Modal
          visible={showProfileModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowProfileModal(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowProfileModal(false)}>
            <Pressable style={styles.profileModalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <ThemedText variant="h3" color={theme.textPrimary}>
                  {editingProfile ? '编辑资料' : '添加资料'}
                </ThemedText>
                <TouchableOpacity onPress={() => setShowProfileModal(false)}>
                  <FontAwesome6 name="xmark" size={20} color={theme.textMuted} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.modalBody}>
                <View style={styles.inputGroup}>
                  <ThemedText variant="labelTitle" color={theme.textMuted}>
                    字段名称
                  </ThemedText>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="如：年龄、套餐、肤质..."
                    placeholderTextColor={theme.textMuted}
                    value={profileFieldName}
                    onChangeText={setProfileFieldName}
                  />
                </View>
                
                <View style={styles.inputGroup}>
                  <ThemedText variant="labelTitle" color={theme.textMuted}>
                    内容
                  </ThemedText>
                  <TextInput
                    style={[styles.modalInput, styles.modalInputMultiline]}
                    placeholder="填写内容..."
                    placeholderTextColor={theme.textMuted}
                    value={profileFieldValue}
                    onChangeText={setProfileFieldValue}
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </View>
              
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setShowProfileModal(false)}
                >
                  <ThemedText variant="bodyMedium" color={theme.textPrimary}>
                    取消
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSubmitButton, savingProfile && styles.modalSubmitButtonDisabled]}
                  onPress={handleSaveProfile}
                  disabled={savingProfile}
                >
                  {savingProfile ? (
                    <ActivityIndicator size="small" color={theme.buttonPrimaryText} />
                  ) : (
                    <ThemedText variant="bodyMedium" color={theme.buttonPrimaryText}>
                      保存
                    </ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Assign Customer Modal - 分配客户 */}
        <Modal
          visible={showAssignModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowAssignModal(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowAssignModal(false)}>
            <Pressable style={styles.profileModalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <ThemedText variant="h3" color={theme.textPrimary}>分配客户</ThemedText>
                <TouchableOpacity onPress={() => setShowAssignModal(false)}>
                  <FontAwesome6 name="xmark" size={20} color={theme.textMuted} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.modalBody}>
                <ThemedText variant="small" color={theme.textMuted} style={{ marginBottom: Spacing.lg }}>
                  选择要分配的美容师：
                </ThemedText>
                
                {employees.map((employee) => (
                  <TouchableOpacity
                    key={employee.id}
                    style={[
                      styles.employeeItem,
                      selectedEmployeeId === employee.id && styles.employeeItemSelected,
                    ]}
                    onPress={() => setSelectedEmployeeId(employee.id)}
                  >
                    <View style={styles.employeeAvatar}>
                      <ThemedText variant="h4" color={theme.primary}>
                        {employee.name.charAt(0)}
                      </ThemedText>
                    </View>
                    <View style={styles.employeeInfo}>
                      <ThemedText variant="bodyMedium" color={theme.textPrimary}>{employee.name}</ThemedText>
                      <ThemedText variant="caption" color={theme.textMuted}>
                        {employee.role === 'store_owner' ? '老板' : employee.role === 'store_manager' ? '店长' : '美容师'}
                      </ThemedText>
                    </View>
                    {selectedEmployeeId === employee.id && (
                      <FontAwesome6 name="check-circle" size={20} color={theme.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
              
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setShowAssignModal(false)}
                >
                  <ThemedText variant="bodyMedium" color={theme.textPrimary}>取消</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSubmitButton, assigning && styles.modalSubmitButtonDisabled]}
                  onPress={handleAssign}
                  disabled={assigning}
                >
                  {assigning ? (
                    <ActivityIndicator size="small" color={theme.buttonPrimaryText} />
                  ) : (
                    <ThemedText variant="bodyMedium" color={theme.buttonPrimaryText}>确定分配</ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Add Tag Modal - 添加标签 */}
        <Modal
          visible={showTagModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowTagModal(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowTagModal(false)}>
            <Pressable style={styles.profileModalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <ThemedText variant="h3" color={theme.textPrimary}>添加标签</ThemedText>
                <TouchableOpacity onPress={() => setShowTagModal(false)}>
                  <FontAwesome6 name="xmark" size={20} color={theme.textMuted} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.modalBody}>
                {/* 自定义标签输入 */}
                <View style={styles.inputGroup}>
                  <ThemedText variant="labelTitle" color={theme.textMuted}>自定义标签</ThemedText>
                  <View style={styles.customTagInput}>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="输入标签名称..."
                      placeholderTextColor={theme.textMuted}
                      value={newTagName}
                      onChangeText={setNewTagName}
                    />
                    <TouchableOpacity 
                      style={[styles.addTagSubmitButton, (!newTagName.trim() || addingTag) && styles.addTagSubmitButtonDisabled]}
                      onPress={() => handleAddTag()}
                      disabled={!newTagName.trim() || addingTag}
                    >
                      {addingTag ? (
                        <ActivityIndicator size="small" color={theme.buttonPrimaryText} />
                      ) : (
                        <FontAwesome6 name="plus" size={16} color={theme.buttonPrimaryText} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
                
                {/* 预设标签 */}
                <View style={styles.inputGroup}>
                  <ThemedText variant="labelTitle" color={theme.textMuted}>快捷标签</ThemedText>
                  <View style={styles.presetTagsGrid}>
                    {tagSuggestions.map((tag, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.presetTagButton}
                        onPress={() => handleAddTag(tag.name)}
                      >
                        <ThemedText variant="small" color={theme.primary}>{tag.name}</ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </ThemedView>
    </Screen>
  );
}
