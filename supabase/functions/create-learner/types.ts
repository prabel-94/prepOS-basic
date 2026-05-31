export type CreateLearnerRequest = {
  email: string
  password: string
  displayName: string
}

export type CreateLearnerResponse = {
  id: string
  userId: string
  email: string
  displayName: string
}

export type CreateLearnerErrorResponse = {
  error: string
}
