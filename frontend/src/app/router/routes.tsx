import { Navigate, Route, Routes } from "react-router-dom";
import { AppStateProvider } from "@/app/state/AppStateProvider";
import { AppGate } from "@/app/pages/AppGate";
import {
  ProtectedRoute,
  GuestRoute,
  AuthenticatedRoute,
} from "@/app/router/ProtectedRoute";
import { LoginPage, ForgotPasswordPage, RegisterPage, ApplyPage } from "@/app/pages/authPages";
import { HomePage, PortalPage, RightsPage } from "@/app/pages/candidatePages";
import { TalentPoolPage, TalentPoolDonePage } from "@/app/pages/talentPoolPages";
import { InterviewFlowPage } from "@/app/pages/interviewFlowPage";
import {
  HrLayout,
  HrDashboardPage,
  HrCandidateDetailPage,
  HrJobMasterPage,
  HrScreeningPage,
  HrTalentPoolPage,
  HrAuditPage,
  HrReattemptsPage,
  HrAnalysisPage,
  CvAnalyserRoutePage,
} from "@/app/pages/hrPages";

export function AppRoutes() {
  return (
    <AppStateProvider>
      <Routes>
        <Route element={<AppGate />}>
          <Route index element={<HomePage />} />
          <Route
            path="login"
            element={
              <GuestRoute>
                <LoginPage />
              </GuestRoute>
            }
          />
          <Route path="login/forgot" element={<ForgotPasswordPage />} />
          <Route
            path="register"
            element={
              <GuestRoute>
                <RegisterPage />
              </GuestRoute>
            }
          />
          <Route path="talent-pool" element={<TalentPoolPage />} />
          <Route path="talent-pool/done" element={<TalentPoolDonePage />} />
          <Route
            path="portal"
            element={
              <ProtectedRoute role="candidate">
                <PortalPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="portal/rights"
            element={
              <ProtectedRoute role="candidate">
                <RightsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="jobs/:jobId/apply"
            element={
              <ProtectedRoute role="candidate">
                <ApplyPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="interview"
            element={
              <AuthenticatedRoute>
                <InterviewFlowPage />
              </AuthenticatedRoute>
            }
          />
          <Route
            path="cv-analyser"
            element={
              <ProtectedRoute role="hr">
                <CvAnalyserRoutePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="hr"
            element={
              <ProtectedRoute role="hr">
                <HrLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<HrDashboardPage />} />
            <Route path="candidates/:candidateId" element={<HrCandidateDetailPage />} />
            <Route path="jobs" element={<HrJobMasterPage />} />
            <Route path="screening" element={<HrScreeningPage />} />
            <Route path="talent-pool" element={<HrTalentPoolPage />} />
            <Route path="audit" element={<HrAuditPage />} />
            <Route path="reattempts" element={<HrReattemptsPage />} />
            <Route path="analysis/:candidateId" element={<HrAnalysisPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AppStateProvider>
  );
}
