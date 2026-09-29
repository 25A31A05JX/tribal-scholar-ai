export type Role = 'student' | 'admin'
export type ApplicationStatus = 'Submitted' | 'Under Review' | 'Deficiency' | 'Resubmitted' | 'Approved' | 'Rejected'
export type DocumentStatus = 'Missing' | 'Uploaded' | 'Under Review' | 'Verified' | 'Rejected'

export interface Profile {
  fullName: string
  email: string
  mobile: string
  dateOfBirth: string
  gender: string
  state: string
  district: string
  institution: string
  course: string
  educationLevel: string
  yearOfStudy: string
  cgpa: number
  income: number
  bankAccount: string
  ifsc: string
  tribe: string
  category: string
}

export interface Scholarship {
  id: string
  name: string
  description: string
  benefits: string
  deadline: string
  minCgpa: number
  maxIncome: number
  category: string
  educationLevel: string
  requiredDocuments: string[]
  active: boolean
}

export interface StudentDocument {
  name: string
  status: DocumentStatus
  fileName?: string
  storagePath?: string
}

export interface Deficiency {
  reason: string
  message: string
  deadline: string
  documentName?: string
}

export interface Application {
  demo?: boolean
  applicationId: string
  studentId: string
  studentName: string
  scholarshipId: string
  scholarshipName: string
  profile: Profile
  eligibilityResult: boolean
  eligibilityChecks: { label: string; actual: string; requirement: string; pass: boolean }[]
  status: ApplicationStatus
  documents: StudentDocument[]
  deficiency?: Deficiency
  submittedAt: string
  updatedAt: string
}

export interface Notification {
  id: string
  role: Role
  userId?: string
  message: string
  detail: string
  date: string
  read: boolean
}

export interface AppState {
  profile: Profile
  scholarships: Scholarship[]
  applications: Application[]
  notifications: Notification[]
}
