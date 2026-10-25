import { api } from './api'

export interface ActivityLogItem {
  id: number
  user_id?: number
  user_name: string
  user_role: string
  module: string
  action: string
  record_id: string
  description: string
  ip_address?: string
  created_at: string
}

export interface ActivityLogResponse {
  items: ActivityLogItem[]
  total: number
  page: number
  limit: number
  total_pages: number
  current_page: number
}

export const activityLogService = {
  async getLogs(params: {
    module?: string
    action?: string
    search?: string
    page?: number
    limit?: number
  }): Promise<ActivityLogResponse> {
    const query = new URLSearchParams()
    if (params.module) query.set('module', params.module)
    if (params.action) query.set('action', params.action)
    if (params.search) query.set('search', params.search)
    if (params.page) query.set('page', String(params.page))
    if (params.limit) query.set('limit', String(params.limit))

    const url = `/activity-logs?${query.toString()}`
    const res = await api.get<{ data: ActivityLogResponse }>(url)
    return (res as any).data || res
  },
}
