import React, { useState, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useTheme } from '@/hooks/useTheme';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { createStyles } from './styles';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

export default function AddCustomerScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useSafeRouter();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('提示', '请输入客户姓名');
      return;
    }

    setLoading(true);
    try {
      /**
       * 服务端文件：server/src/index.ts
       * 接口：POST /api/v1/customers
       * Body 参数：name: string, phone?: string, notes?: string
       */
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), notes: notes.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '保存失败');
      }

      Alert.alert('成功', '客户添加成功', [
        { text: '好的', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('错误', error.message || '保存失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ThemedView level="root" style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <FontAwesome6 name="xmark" size={20} color={theme.textPrimary} />
            </TouchableOpacity>
            <ThemedText variant="h3" color={theme.textPrimary}>
              添加客户
            </ThemedText>
            <View style={styles.placeholder} />
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Name Input */}
            <View style={styles.inputGroup}>
              <ThemedText variant="labelTitle" color={theme.textMuted}>
                姓名 *
              </ThemedText>
              <TextInput
                style={styles.input}
                placeholder="请输入客户姓名"
                placeholderTextColor={theme.textMuted}
                value={name}
                onChangeText={setName}
                maxLength={50}
              />
            </View>

            {/* Phone Input */}
            <View style={styles.inputGroup}>
              <ThemedText variant="labelTitle" color={theme.textMuted}>
                电话
              </ThemedText>
              <TextInput
                style={styles.input}
                placeholder="请输入联系电话"
                placeholderTextColor={theme.textMuted}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={20}
              />
            </View>

            {/* Notes Input */}
            <View style={styles.inputGroup}>
              <ThemedText variant="labelTitle" color={theme.textMuted}>
                备注
              </ThemedText>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="记录客户特点、偏好等信息..."
                placeholderTextColor={theme.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={500}
              />
            </View>

            {/* Quick Tags */}
            <View style={styles.section}>
              <ThemedText variant="labelTitle" color={theme.textMuted}>
                快速标签（点击添加到备注）
              </ThemedText>
              <View style={styles.quickTagsContainer}>
                {['新客户', '抗衰需求', '补水项目', '敏感肌', '常客'].map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={styles.quickTag}
                    onPress={() => setNotes((prev) => (prev ? `${prev} #${tag}` : `#${tag}`))}
                  >
                    <ThemedText variant="small" color={theme.primary}>
                      #{tag}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Bottom Button */}
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[styles.saveButton, loading && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={loading}
            >
              <ThemedText variant="bodyMedium" color={theme.buttonPrimaryText}>
                {loading ? '保存中...' : '保存'}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
