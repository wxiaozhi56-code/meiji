import React, { useState, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { FontAwesome5, FontAwesome6 } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { useTheme } from '@/hooks/useTheme';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { createStyles } from './styles';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

interface Customer {
  id: number;
  name: string;
  phone?: string;
  avatar?: string;
  customer_tags?: Array<{ tag_name: string; category: string }>;
  follow_up_records?: Array<{ id: number; created_at: string; content: string }>;
  ai_briefs?: Array<{ summary: string; suggestions: any }>;
  generated_messages?: Array<{ id: number; type: string; content: string }>;
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

  React.useEffect(() => {
    fetchCustomer();
  }, [params.id]);

  const fetchCustomer = async () => {
    if (!params.id) return;
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/customers/${params.id}`);
      const data = await response.json();
      setCustomer(data);
    } catch (error) {
      console.error('Failed to fetch customer:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!customer) return;
    setShowDeleteModal(false);
    setDeleting(true);
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/customers/${customer.id}`, {
        method: 'DELETE',
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

  const handleGenerateMessages = () => {
    if (customer) {
      router.push('/generate-messages', { customerId: customer.id });
    }
  };

  const handleCopyMessage = (content: string) => {
    console.log('Copy message:', content);
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
          <TouchableOpacity onPress={handleStartRecord} style={styles.recordButton}>
            <FontAwesome6 name="microphone" size={20} color={theme.buttonPrimaryText} />
          </TouchableOpacity>
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

          {/* Generated Messages Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FontAwesome6 name="comment-dots" size={20} color={theme.accent} />
              <ThemedText variant="title" color={theme.textPrimary}>
                智能话术
              </ThemedText>
            </View>
            <TouchableOpacity
              style={styles.generateButton}
              onPress={handleGenerateMessages}
            >
              <FontAwesome6 name="wand-magic-sparkles" size={16} color={theme.buttonPrimaryText} />
              <ThemedText variant="smallMedium" color={theme.buttonPrimaryText}>
                生成新话术
              </ThemedText>
            </TouchableOpacity>
            {generatedMessages.slice(-3).reverse().map((message) => (
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

          {/* Follow-up History Section */}
          {followUpHistory.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <FontAwesome5 name="history" size={20} color={theme.accent} />
                <ThemedText variant="title" color={theme.textPrimary}>
                  跟进记录
                </ThemedText>
              </View>
              {followUpHistory.slice(-5).reverse().map((record) => (
                <View key={record.id} style={styles.historyCard}>
                  <ThemedText variant="caption" color={theme.textMuted}>
                    {record.created_at?.split('T')[0]}
                  </ThemedText>
                  <ThemedText variant="small" color={theme.textSecondary}>
                    {record.content}
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
      </ThemedView>
    </Screen>
  );
}
