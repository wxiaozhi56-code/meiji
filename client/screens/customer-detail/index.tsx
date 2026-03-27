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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { useTheme } from '@/hooks/useTheme';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { createStyles } from './styles';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

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
  customer_tags?: Array<{ tag_name: string; category: string }>;
  customer_profiles?: CustomerProfile[];
  follow_up_records?: Array<{ id: number; created_at: string; content: string; audio_url?: string }>;
  ai_briefs?: Array<{ id: number; summary: string; suggestions: any; follow_up_record_id?: number }>;
  generated_messages?: Array<{ id: number; type: string; content: string; follow_up_record_id?: number }>;
}

export default function CustomerDetailScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useSafeRouter();
  const params = useSafeSearchParams<{ id: number }>();
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

  React.useEffect(() => {
    fetchCustomer();
  }, [params.id]);

  const fetchCustomer = async () => {
    if (!params.id) return;
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        router.replace('/login');
        return;
      }

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

  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  // 删除跟进记录
  const handleDeleteFollowUpRecord = async (recordId: number) => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        router.replace('/login');
        return;
      }

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
    if (!customer || !profileFieldName.trim()) {
      Toast.show({
        type: 'error',
        text1: '请填写字段名称',
      });
      return;
    }

    setSavingProfile(true);
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        router.replace('/login');
        return;
      }

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
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        router.replace('/login');
        return;
      }

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
    if (!customer) return;
    setShowDeleteModal(false);
    setDeleting(true);
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        router.replace('/login');
        return;
      }

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

            {tags.length > 0 && (
              <View style={styles.tagsContainer}>
                {tags.map((tag, index) => (
                  <View key={index} style={styles.tag}>
                    <ThemedText variant="tiny" color={theme.primary}>
                      {tag.tag_name}
                    </ThemedText>
                  </View>
                ))}
              </View>
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
      </ThemedView>
    </Screen>
  );
}
