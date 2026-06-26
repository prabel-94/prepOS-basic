export type DeleteLearnerRequest = {
  userId: string
  confirmation: string
}

export type DeleteLearnerResponse = {
  success: true
  deletedUserId: string
  displayName: string
  removed: {
    examAttempts: number
    examAssignments: number
    practiceAttempts: number
    questionStats: number
    batchMemberships: number
  }
}

export type DeleteLearnerErrorResponse = {
  error: string
}
