import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useFocusEffect } from 'expo-router';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { createStyles } from './styles';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

// 角色名称映射
const ROLE_NAMES: Record<string, string> = {
  store_owner: '门店老板',
  store_manager: '门店店长',
  beautician: '美容师',
};

// 角色选项
const ROLE_OPTIONS = [
  { value: 'store_manager', label: '门店店长' },
  { value: 'beautician', label: '美容师' },
];

// 跨平台提示函数
const showAlert = (title: string, message: string, buttons?: { text: string; style?: string; onPress?: () => void }[]) => {
  if (Platform.OS === 'web') {
    if (buttons && buttons.length > 1) {
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

interface Employee {
  id: number;
  name: string;
  phone: string;
  role: string;
  status: string;
  created_at: string;
  last_login_at?: string;
}

export default function EmployeeManagementScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useSafeRouter();
  const { token, user } = useAuth();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 添加员工弹窗状态
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('beautician');
  const [addingEmployee, setAddingEmployee] = useState(false);

  const fetchEmployees = useCallback(async () => {
    if (!token) return;
    
    setLoading(true);
    try {
      /**
       * 服务端文件：server/src/routes/employee.routes.ts
       * 接口：GET /api/v1/employees
       * 需要认证：Bearer token（门店老板权限）
       */
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/employees`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setEmployees(data.data || []);
      } else {
        console.error('Failed to fetch employees:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      fetchEmployees();
    }, [fetchEmployees])
  );

  const handleAddEmployee = async () => {
    // 表单验证
    if (!newName.trim()) {
      Toast.show({ type: 'error', text1: '请输入员工姓名' });
      return;
    }

    if (!newPhone.trim() || !/^1[3-9]\d{9}$/.test(newPhone)) {
      Toast.show({ type: 'error', text1: '请输入正确的手机号' });
      return;
    }

    if (!newPassword.trim() || newPassword.length < 6) {
      Toast.show({ type: 'error', text1: '密码长度至少6位' });
      return;
    }

    setAddingEmployee(true);
    try {
      /**
       * 服务端文件：server/src/routes/employee.routes.ts
       * 接口：POST /api/v1/employees
       * Body 参数：name: string, phone: string, password: string, role: string
       */
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/employees`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newName.trim(),
          phone: newPhone.trim(),
          password: newPassword.trim(),
          role: newRole,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || '添加失败');
      }

      Toast.show({
        type: 'success',
        text1: '添加成功',
        text2: `员工账号已创建，手机号: ${newPhone}`,
      });

      // 重置表单
      setNewName('');
      setNewPhone('');
      setNewPassword('');
      setNewRole('beautician');
      setShowAddModal(false);
      
      // 刷新列表
      fetchEmployees();
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: '添加失败',
        text2: error.message || '请重试',
      });
    } finally {
      setAddingEmployee(false);
    }
  };

  const handleToggleStatus = (employee: Employee) => {
    const newStatus = employee.status === 'active' ? 'inactive' : 'active';
    const action = newStatus === 'active' ? '启用' : '禁用';

    showAlert(
      '确认操作',
      `确定要${action}员工「${employee.name}」吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            try {
              /**
               * 服务端文件：server/src/routes/employee.routes.ts
               * 接口：PUT /api/v1/employees/:id/status
               * Body 参数：status: string
               */
              const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/employees/${employee.id}/status`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ status: newStatus }),
              });

              const data = await response.json();

              if (!response.ok || !data.success) {
                throw new Error(data.error || '操作失败');
              }

              Toast.show({
                type: 'success',
                text1: data.message,
              });

              fetchEmployees();
            } catch (error: any) {
              Toast.show({
                type: 'error',
                text1: '操作失败',
                text2: error.message,
              });
            }
          },
        },
      ]
    );
  };

  const handleDeleteEmployee = (employee: Employee) => {
    showAlert(
      '确认删除',
      `确定要删除员工「${employee.name}」吗？此操作不可恢复。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              /**
               * 服务端文件：server/src/routes/employee.routes.ts
               * 接口：DELETE /api/v1/employees/:id
               */
              const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/employees/${employee.id}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                },
              });

              const data = await response.json();

              if (!response.ok || !data.success) {
                throw new Error(data.error || '删除失败');
              }

              Toast.show({
                type: 'success',
                text1: '员工已删除',
              });

              fetchEmployees();
            } catch (error: any) {
              Toast.show({
                type: 'error',
                text1: '删除失败',
                text2: error.message,
              });
            }
          },
        },
      ]
    );
  };

  const renderEmployeeCard = (employee: Employee) => {
    const isSelf = employee.id === user?.id;
    const isActive = employee.status === 'active';

    return (
      <View key={employee.id} style={[styles.employeeCard, !isActive && styles.employeeCardInactive]}>
        <View style={styles.employeeHeader}>
          <View style={styles.employeeAvatar}>
            <ThemedText variant="h4" color={theme.primary}>
              {employee.name.charAt(0)}
            </ThemedText>
          </View>
          <View style={styles.employeeInfo}>
            <View style={styles.employeeNameRow}>
              <ThemedText variant="title" color={theme.textPrimary}>
                {employee.name}
              </ThemedText>
              {isSelf && (
                <View style={styles.selfBadge}>
                  <ThemedText variant="tiny" color={theme.buttonPrimaryText}>我</ThemedText>
                </View>
              )}
              {!isActive && (
                <View style={styles.inactiveBadge}>
                  <ThemedText variant="tiny" color={theme.textMuted}>已禁用</ThemedText>
                </View>
              )}
            </View>
            <ThemedText variant="small" color={theme.textMuted}>
              {employee.phone}
            </ThemedText>
          </View>
        </View>

        <View style={styles.employeeMeta}>
          <View style={styles.employeeMetaItem}>
            <FontAwesome6 name="user-tag" size={12} color={theme.textMuted} />
            <ThemedText variant="caption" color={theme.textMuted}>
              {ROLE_NAMES[employee.role] || employee.role}
            </ThemedText>
          </View>
          <View style={styles.employeeMetaItem}>
            <FontAwesome6 name="calendar" size={12} color={theme.textMuted} />
            <ThemedText variant="caption" color={theme.textMuted}>
              创建于 {employee.created_at?.split('T')[0]}
            </ThemedText>
          </View>
        </View>

        {/* 操作按钮（不能操作自己） */}
        {!isSelf && (
          <View style={styles.employeeActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleToggleStatus(employee)}
            >
              <FontAwesome6 
                name={isActive ? "ban" : "check"} 
                size={14} 
                color={isActive ? theme.error : theme.success} 
              />
              <ThemedText variant="caption" color={isActive ? theme.error : theme.success}>
                {isActive ? '禁用' : '启用'}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleDeleteEmployee(employee)}
            >
              <FontAwesome6 name="trash" size={14} color={theme.error} />
              <ThemedText variant="caption" color={theme.error}>删除</ThemedText>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <Screen backgroundColor={theme.backgroundRoot} statusBarStyle={isDark ? 'light' : 'dark'}>
      <ThemedView level="root" style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <FontAwesome6 name="arrow-left" size={20} color={theme.textPrimary} />
          </TouchableOpacity>
          <ThemedText variant="h3" color={theme.textPrimary}>
            员工管理
          </ThemedText>
          <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
            <FontAwesome6 name="plus" size={20} color={theme.buttonPrimaryText} />
          </TouchableOpacity>
        </View>

        {/* 说明 */}
        <View style={styles.infoBar}>
          <FontAwesome6 name="info-circle" size={14} color={theme.textMuted} />
          <ThemedText variant="small" color={theme.textMuted}>
            添加的员工账号将自动绑定到您的门店
          </ThemedText>
        </View>

        {/* 员工列表 */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <ThemedText variant="h3" color={theme.primary}>
                  {employees.length}
                </ThemedText>
                <ThemedText variant="caption" color={theme.textMuted}>
                  总员工数
                </ThemedText>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <ThemedText variant="h3" color={theme.success}>
                  {employees.filter(e => e.status === 'active').length}
                </ThemedText>
                <ThemedText variant="caption" color={theme.textMuted}>
                  活跃员工
                </ThemedText>
              </View>
            </View>

            <ThemedText variant="labelTitle" color={theme.textMuted}>
              员工列表
            </ThemedText>

            <View style={styles.employeeList}>
              {employees.map(renderEmployeeCard)}
            </View>

            {employees.length === 0 && (
              <View style={styles.emptyContainer}>
                <FontAwesome6 name="users" size={48} color={theme.textMuted} />
                <ThemedText variant="body" color={theme.textMuted}>
                  暂无员工
                </ThemedText>
                <TouchableOpacity style={styles.emptyAddButton} onPress={() => setShowAddModal(true)}>
                  <ThemedText variant="smallMedium" color={theme.buttonPrimaryText}>
                    添加第一位员工
                  </ThemedText>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        )}

        {/* 添加员工弹窗 */}
        <Modal
          visible={showAddModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowAddModal(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowAddModal(false)}>
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <ThemedText variant="h3" color={theme.textPrimary}>添加员工</ThemedText>
                <TouchableOpacity onPress={() => setShowAddModal(false)}>
                  <FontAwesome6 name="xmark" size={20} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <View style={styles.inputGroup}>
                  <ThemedText variant="labelTitle" color={theme.textMuted}>姓名 *</ThemedText>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="请输入员工姓名"
                    placeholderTextColor={theme.textMuted}
                    value={newName}
                    onChangeText={setNewName}
                    maxLength={20}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText variant="labelTitle" color={theme.textMuted}>手机号 *</ThemedText>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="请输入手机号（作为登录账号）"
                    placeholderTextColor={theme.textMuted}
                    value={newPhone}
                    onChangeText={setNewPhone}
                    keyboardType="phone-pad"
                    maxLength={11}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText variant="labelTitle" color={theme.textMuted}>密码 *</ThemedText>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="请输入密码（至少6位）"
                    placeholderTextColor={theme.textMuted}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                    maxLength={20}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText variant="labelTitle" color={theme.textMuted}>角色 *</ThemedText>
                  <View style={styles.roleOptions}>
                    {ROLE_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.roleOption,
                          newRole === option.value && styles.roleOptionSelected,
                        ]}
                        onPress={() => setNewRole(option.value)}
                      >
                        <ThemedText
                          variant="small"
                          color={newRole === option.value ? theme.buttonPrimaryText : theme.textPrimary}
                        >
                          {option.label}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setShowAddModal(false)}
                >
                  <ThemedText variant="bodyMedium" color={theme.textPrimary}>取消</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSubmitButton, addingEmployee && styles.modalSubmitButtonDisabled]}
                  onPress={handleAddEmployee}
                  disabled={addingEmployee}
                >
                  {addingEmployee ? (
                    <ActivityIndicator size="small" color={theme.buttonPrimaryText} />
                  ) : (
                    <ThemedText variant="bodyMedium" color={theme.buttonPrimaryText}>添加</ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </ThemedView>
      <Toast />
    </Screen>
  );
}
