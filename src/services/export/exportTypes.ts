export type ExportFormat = 'csv' | 'xlsx' | 'pdf' | 'docx'

export type ExportRequest = {
  format: ExportFormat
  suggestedName: string
}