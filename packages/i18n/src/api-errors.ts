import { m } from './paraglide/messages.js'
import type { MinaLocale } from './locale'

export type MessageParams = Record<string, string | number | boolean>

export const apiErrorMessageKeys = [
  'api_error_not_found',
  'api_error_internal_server_error',
  'api_error_unauthenticated',
  'api_error_admin_required',
  'api_error_account_access_denied',
  'api_error_auth_invalid_credentials',
  'api_error_email_already_registered',
  'api_error_username_already_registered',
  'api_error_account_not_initialized',
  'api_error_account_avatar_file_required',
  'api_error_account_avatar_upload_too_large',
  'api_error_account_avatar_type_unsupported',
  'api_error_account_current_password_invalid',
  'api_error_public_share_request_not_implemented',
  'api_error_validation_failed',
  'api_error_task_not_found',
  'api_error_task_not_cancellable',
  'api_error_task_prompt_required',
  'api_error_task_config_invalid',
  'api_error_task_model_unsupported',
  'api_error_media_file_required',
  'api_error_media_upload_too_large',
  'api_error_media_type_unsupported',
  'api_error_media_object_not_found',
  'api_error_media_object_not_uploading',
  'api_error_media_upload_key_mismatch',
  'api_error_pricing_rule_not_found',
  'api_error_workflow_not_found',
  'api_error_workflow_run_not_found',
  'api_error_workflow_node_not_found',
  'api_error_workflow_node_not_executable',
  'api_error_workflow_run_not_cancellable',
  'api_error_workflow_validation_failed',
  'api_error_workflow_version_conflict',
  'api_error_workflow_upstream_output_missing',
  'api_error_workflow_upstream_output_kind_mismatch',
  'api_error_workflow_isolated_run_output_selector',
  'api_error_provider_timeout',
  'api_error_provider_unavailable',
  'api_error_provider_rate_limited',
  'api_error_provider_auth_failed',
  'api_error_provider_content_rejected',
  'api_error_provider_failed',
  'api_error_task_expired',
  'api_error_task_start_retry',
  'api_error_task_poll_retry',
  'api_error_task_start_retry_exhausted',
  'api_error_task_poll_retry_exhausted',
  'api_error_workflow_node_failed',
  'api_error_workflow_run_failed',
  'api_error_project_not_found',
  'api_error_project_workflow_not_found',
  'api_error_project_distinct_workflows_required',
  'api_error_workflow_already_in_project',
  'api_error_asset_library_item_not_found',
  'api_error_asset_folder_not_found',
  'api_error_asset_tag_not_found',
  'api_error_asset_system_tag_immutable',
] as const

export type ApiErrorMessageKey = (typeof apiErrorMessageKeys)[number]

type ApiMessageFunction = (params?: MessageParams, options?: { locale?: MinaLocale }) => string

const paramValue = (params: MessageParams | undefined, key: string, fallback: string): string | number | boolean =>
  params?.[key] ?? fallback

const providerParams = (params: MessageParams | undefined): { provider: string | number | boolean } => ({
  provider: paramValue(params, 'provider', 'Provider'),
})

const apiErrorMessageByKey = {
  api_error_not_found: m.api_error_not_found,
  api_error_internal_server_error: m.api_error_internal_server_error,
  api_error_unauthenticated: m.api_error_unauthenticated,
  api_error_admin_required: m.api_error_admin_required,
  api_error_account_access_denied: m.api_error_account_access_denied,
  api_error_auth_invalid_credentials: m.api_error_auth_invalid_credentials,
  api_error_email_already_registered: m.api_error_email_already_registered,
  api_error_username_already_registered: m.api_error_username_already_registered,
  api_error_account_not_initialized: m.api_error_account_not_initialized,
  api_error_account_avatar_file_required: m.api_error_account_avatar_file_required,
  api_error_account_avatar_upload_too_large: m.api_error_account_avatar_upload_too_large,
  api_error_account_avatar_type_unsupported: m.api_error_account_avatar_type_unsupported,
  api_error_account_current_password_invalid: m.api_error_account_current_password_invalid,
  api_error_public_share_request_not_implemented: m.api_error_public_share_request_not_implemented,
  api_error_validation_failed: m.api_error_validation_failed,
  api_error_task_not_found: m.api_error_task_not_found,
  api_error_task_not_cancellable: m.api_error_task_not_cancellable,
  api_error_task_prompt_required: m.api_error_task_prompt_required,
  api_error_task_config_invalid: m.api_error_task_config_invalid,
  api_error_task_model_unsupported: (params, options) =>
    m.api_error_task_model_unsupported({
      kind: paramValue(params, 'kind', 'unknown'),
      provider: paramValue(params, 'provider', 'unknown'),
      model: paramValue(params, 'model', 'unknown'),
    }, options),
  api_error_media_file_required: m.api_error_media_file_required,
  api_error_media_upload_too_large: m.api_error_media_upload_too_large,
  api_error_media_type_unsupported: m.api_error_media_type_unsupported,
  api_error_media_object_not_found: m.api_error_media_object_not_found,
  api_error_media_object_not_uploading: m.api_error_media_object_not_uploading,
  api_error_media_upload_key_mismatch: m.api_error_media_upload_key_mismatch,
  api_error_pricing_rule_not_found: m.api_error_pricing_rule_not_found,
  api_error_workflow_not_found: m.api_error_workflow_not_found,
  api_error_workflow_run_not_found: m.api_error_workflow_run_not_found,
  api_error_workflow_node_not_found: m.api_error_workflow_node_not_found,
  api_error_workflow_node_not_executable: m.api_error_workflow_node_not_executable,
  api_error_workflow_run_not_cancellable: m.api_error_workflow_run_not_cancellable,
  api_error_workflow_validation_failed: m.api_error_workflow_validation_failed,
  api_error_workflow_version_conflict: m.api_error_workflow_version_conflict,
  api_error_workflow_upstream_output_missing: m.api_error_workflow_upstream_output_missing,
  api_error_workflow_upstream_output_kind_mismatch: m.api_error_workflow_upstream_output_kind_mismatch,
  api_error_workflow_isolated_run_output_selector: m.api_error_workflow_isolated_run_output_selector,
  api_error_provider_timeout: (params, options) => m.api_error_provider_timeout(providerParams(params), options),
  api_error_provider_unavailable: (params, options) => m.api_error_provider_unavailable(providerParams(params), options),
  api_error_provider_rate_limited: (params, options) => m.api_error_provider_rate_limited(providerParams(params), options),
  api_error_provider_auth_failed: (params, options) => m.api_error_provider_auth_failed(providerParams(params), options),
  api_error_provider_content_rejected: (params, options) => m.api_error_provider_content_rejected(providerParams(params), options),
  api_error_provider_failed: (params, options) => m.api_error_provider_failed(providerParams(params), options),
  api_error_task_expired: m.api_error_task_expired,
  api_error_task_start_retry: m.api_error_task_start_retry,
  api_error_task_poll_retry: m.api_error_task_poll_retry,
  api_error_task_start_retry_exhausted: m.api_error_task_start_retry_exhausted,
  api_error_task_poll_retry_exhausted: m.api_error_task_poll_retry_exhausted,
  api_error_workflow_node_failed: m.api_error_workflow_node_failed,
  api_error_workflow_run_failed: m.api_error_workflow_run_failed,
  api_error_project_not_found: m.api_error_project_not_found,
  api_error_project_workflow_not_found: m.api_error_project_workflow_not_found,
  api_error_project_distinct_workflows_required: m.api_error_project_distinct_workflows_required,
  api_error_workflow_already_in_project: m.api_error_workflow_already_in_project,
  api_error_asset_library_item_not_found: m.api_error_asset_library_item_not_found,
  api_error_asset_folder_not_found: m.api_error_asset_folder_not_found,
  api_error_asset_tag_not_found: m.api_error_asset_tag_not_found,
  api_error_asset_system_tag_immutable: m.api_error_asset_system_tag_immutable,
} satisfies Record<ApiErrorMessageKey, ApiMessageFunction>

export const apiErrorMessageKeyByCode = {
  ACCOUNT_ACCESS_DENIED: 'api_error_account_access_denied',
  ACCOUNT_AVATAR_FILE_REQUIRED: 'api_error_account_avatar_file_required',
  ACCOUNT_AVATAR_TYPE_UNSUPPORTED: 'api_error_account_avatar_type_unsupported',
  ACCOUNT_AVATAR_UPLOAD_TOO_LARGE: 'api_error_account_avatar_upload_too_large',
  ACCOUNT_CURRENT_PASSWORD_INVALID: 'api_error_account_current_password_invalid',
  ACCOUNT_NOT_INITIALIZED: 'api_error_account_not_initialized',
  ADMIN_REQUIRED: 'api_error_admin_required',
  ASSET_FOLDER_NOT_FOUND: 'api_error_asset_folder_not_found',
  ASSET_LIBRARY_ITEM_NOT_FOUND: 'api_error_asset_library_item_not_found',
  ASSET_SYSTEM_TAG_IMMUTABLE: 'api_error_asset_system_tag_immutable',
  ASSET_TAG_NOT_FOUND: 'api_error_asset_tag_not_found',
  AUTH_INVALID_CREDENTIALS: 'api_error_auth_invalid_credentials',
  EMAIL_ALREADY_REGISTERED: 'api_error_email_already_registered',
  INTERNAL_SERVER_ERROR: 'api_error_internal_server_error',
  INVALID_CREDENTIALS: 'api_error_auth_invalid_credentials',
  NOT_FOUND: 'api_error_not_found',
  PUBLIC_SHARE_REQUEST_NOT_IMPLEMENTED: 'api_error_public_share_request_not_implemented',
  MEDIA_FILE_REQUIRED: 'api_error_media_file_required',
  MEDIA_OBJECT_NOT_FOUND: 'api_error_media_object_not_found',
  MEDIA_OBJECT_NOT_UPLOADING: 'api_error_media_object_not_uploading',
  MEDIA_TYPE_UNSUPPORTED: 'api_error_media_type_unsupported',
  MEDIA_UPLOAD_KEY_MISMATCH: 'api_error_media_upload_key_mismatch',
  MEDIA_UPLOAD_TOO_LARGE: 'api_error_media_upload_too_large',
  PRICING_RULE_NOT_FOUND: 'api_error_pricing_rule_not_found',
  PROJECT_DISTINCT_WORKFLOWS_REQUIRED: 'api_error_project_distinct_workflows_required',
  PROJECT_NOT_FOUND: 'api_error_project_not_found',
  PROJECT_WORKFLOW_NOT_FOUND: 'api_error_project_workflow_not_found',
  TASK_CONFIG_INVALID: 'api_error_task_config_invalid',
  TASK_EXPIRED: 'api_error_task_expired',
  TASK_MODEL_UNSUPPORTED: 'api_error_task_model_unsupported',
  TASK_NOT_CANCELLABLE: 'api_error_task_not_cancellable',
  TASK_NOT_FOUND: 'api_error_task_not_found',
  TASK_POLL_RETRY: 'api_error_task_poll_retry',
  TASK_POLL_RETRY_EXHAUSTED: 'api_error_task_poll_retry_exhausted',
  TASK_PROMPT_REQUIRED: 'api_error_task_prompt_required',
  TASK_START_RETRY: 'api_error_task_start_retry',
  TASK_START_RETRY_EXHAUSTED: 'api_error_task_start_retry_exhausted',
  UNAUTHENTICATED: 'api_error_unauthenticated',
  UNAUTHORIZED: 'api_error_unauthenticated',
  USERNAME_ALREADY_REGISTERED: 'api_error_username_already_registered',
  VALIDATION_FAILED: 'api_error_validation_failed',
  WORKFLOW_CROSS_FLOW_EDGE: 'api_error_workflow_validation_failed',
  WORKFLOW_EDGE_NODE_NOT_FOUND: 'api_error_workflow_validation_failed',
  WORKFLOW_FLOW_CYCLE: 'api_error_workflow_validation_failed',
  WORKFLOW_ISOLATED_RUN_OUTPUT_SELECTOR: 'api_error_workflow_isolated_run_output_selector',
  WORKFLOW_MEDIA_EDGE_SLOT_MISSING: 'api_error_workflow_validation_failed',
  WORKFLOW_MEDIA_SLOT_EDGE_MISSING: 'api_error_workflow_validation_failed',
  WORKFLOW_MEDIA_SLOT_NODE_NOT_FOUND: 'api_error_workflow_validation_failed',
  WORKFLOW_NODE_FAILED: 'api_error_workflow_node_failed',
  WORKFLOW_NODE_NOT_EXECUTABLE: 'api_error_workflow_node_not_executable',
  WORKFLOW_NODE_NOT_FOUND: 'api_error_workflow_node_not_found',
  WORKFLOW_NODE_TYPE_MISMATCH: 'api_error_workflow_validation_failed',
  WORKFLOW_NOT_FOUND: 'api_error_workflow_not_found',
  WORKFLOW_PARENT_NOT_FOUND: 'api_error_workflow_validation_failed',
  WORKFLOW_VERSION_CONFLICT: 'api_error_workflow_version_conflict',
  WORKFLOW_RUN_FAILED: 'api_error_workflow_run_failed',
  WORKFLOW_RUN_NOT_CANCELLABLE: 'api_error_workflow_run_not_cancellable',
  WORKFLOW_RUN_NOT_FOUND: 'api_error_workflow_run_not_found',
  WORKFLOW_UPSTREAM_OUTPUT_KIND_MISMATCH: 'api_error_workflow_upstream_output_kind_mismatch',
  WORKFLOW_UPSTREAM_OUTPUT_MISSING: 'api_error_workflow_upstream_output_missing',
  WORKFLOW_ALREADY_IN_PROJECT: 'api_error_workflow_already_in_project',
} satisfies Record<string, ApiErrorMessageKey>

export type KnownApiErrorCode = keyof typeof apiErrorMessageKeyByCode

export const getApiErrorMessageKeyForCode = (code: string): ApiErrorMessageKey | undefined =>
  apiErrorMessageKeyByCode[code as KnownApiErrorCode]

export const translateApiErrorMessage = (
  key: ApiErrorMessageKey,
  locale: MinaLocale,
  params?: MessageParams,
): string => apiErrorMessageByKey[key](params, { locale })

export const providerErrorMessageKeyByCode = {
  PROVIDER_AUTH_FAILED: 'api_error_provider_auth_failed',
  PROVIDER_CONTENT_REJECTED: 'api_error_provider_content_rejected',
  PROVIDER_FAILED: 'api_error_provider_failed',
  PROVIDER_RATE_LIMITED: 'api_error_provider_rate_limited',
  PROVIDER_TIMEOUT: 'api_error_provider_timeout',
  PROVIDER_UNAVAILABLE: 'api_error_provider_unavailable',
} satisfies Record<string, ApiErrorMessageKey>

export type KnownProviderErrorCode = keyof typeof providerErrorMessageKeyByCode

export const getProviderErrorMessageKeyForCode = (code: string): ApiErrorMessageKey | undefined =>
  providerErrorMessageKeyByCode[code as KnownProviderErrorCode]

const providerNameByCodePrefix = {
  GOOGLE_: 'Google',
  VOLCENGINE_: 'Volcengine',
} as const

export const classifyTaskError = (
  code: string,
  input: {
    model?: string
    provider?: string
  } = {},
): { messageKey?: ApiErrorMessageKey; params?: MessageParams } => {
  const explicitKey = getApiErrorMessageKeyForCode(code) ?? getProviderErrorMessageKeyForCode(code)
  if (explicitKey) {
    return {
      messageKey: explicitKey,
      ...(input.provider ? { params: { provider: input.provider } } : {}),
    }
  }

  const provider =
    input.provider ??
    Object.entries(providerNameByCodePrefix).find(([prefix]) => code.startsWith(prefix))?.[1] ??
    'Provider'

  return {
    messageKey: 'api_error_provider_failed',
    params: {
      provider,
      ...(input.model ? { model: input.model } : {}),
    },
  }
}
