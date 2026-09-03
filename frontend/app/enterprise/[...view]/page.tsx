import {
  AuditScreen, BillingScreen, CandidateProfileScreen,
  CandidatesScreen, ComparisonScreen,
  IntegrationsScreen, InterviewDetailScreen, OnboardingScreen,
  InvitationsScreen, LiveScreen, NotificationsScreen,
  RolesScreen, SettingsScreen, SupportScreen,
  TeamScreen, UnknownEnterpriseScreen,
} from '@/components/console/EnterpriseScreens';
import {
  CandidateActivityScreen,
  EmptyCandidatePipelineScreen, EnterpriseAccessDeniedScreen,
  EnterpriseErrorScreen, EnterpriseLoadingScreen,
} from '@/components/console/EnterpriseRemainingScreens';
import { EnterpriseInterviewBuilder } from '@/components/console/EnterpriseInterviewBuilder';
import { EnterpriseInterviewDetailClient, EnterpriseInterviewsClient, EnterpriseTemplatesClient } from '@/components/console/EnterpriseInterviewManagement';
import { EnterpriseInterviewTest } from '@/components/console/EnterpriseInterviewTest';
import { EnterpriseReportDetailClient, EnterpriseReportsClient } from '@/components/console/EnterpriseReports';
import { redirect } from 'next/navigation';

export default async function EnterpriseViewPage({ params }: { params: Promise<{ view: string[] }> }) {
  const { view } = await params;
  const route = view.join('/');

  if (route === 'interviews') return <EnterpriseInterviewsClient />;
  if (route === 'templates') return <EnterpriseTemplatesClient />;
  if (route === 'interviews/frontend-architect') return <InterviewDetailScreen />;
  if (route.startsWith('interviews/') && route.endsWith('/test')) return <EnterpriseInterviewTest panelId={route.split('/')[1]} />;
  if (route.startsWith('interviews/')) return <EnterpriseInterviewDetailClient panelId={route.slice('interviews/'.length)} />;
  if (route === 'candidates' || route === 'pipeline') return <CandidatesScreen />;
  if (route === 'candidates/empty') return <EmptyCandidatePipelineScreen />;
  if (route.startsWith('candidates/') && route.endsWith('/report')) return <EnterpriseReportDetailClient candidateSlug={route.split('/')[1]} />;
  if (route.startsWith('candidates/') && route.endsWith('/activity')) return <CandidateActivityScreen candidateSlug={route.split('/')[1]} />;
  if (route.startsWith('candidates/')) return <CandidateProfileScreen />;
  if (route === 'invitations') return <InvitationsScreen />;
  if (route === 'comparison') return <ComparisonScreen />;
  if (route === 'live') return <LiveScreen />;
  if (route === 'reports') return <EnterpriseReportsClient />;
  if (route === 'reports/query') return <EnterpriseReportsClient queryMode />;
  if (route === 'reports/history') return <EnterpriseReportsClient />;
  if (route.startsWith('reports/')) return <EnterpriseReportDetailClient reportId={route.slice('reports/'.length)} />;
  if (route === 'report') return <EnterpriseReportsClient />;
  if (route === 'notifications') return <NotificationsScreen />;
  if (route === 'team') return <TeamScreen />;
  if (route === 'settings') return <SettingsScreen />;
  if (route === 'settings/roles') return <RolesScreen />;
  if (route === 'settings/integrations') return <IntegrationsScreen />;
  if (route === 'settings/billing') return <BillingScreen />;
  if (route === 'audit-log') return <AuditScreen />;
  if (route === 'support') return <SupportScreen />;
  if (route === 'onboarding') return <OnboardingScreen />;
  if (route === 'access-denied') return <EnterpriseAccessDeniedScreen />;
  if (route === 'error') return <EnterpriseErrorScreen />;
  if (route === 'loading-preview') return <EnterpriseLoadingScreen />;
  if (route === 'builder/rubric') redirect('/enterprise/builder/ai');
  if (route.startsWith('builder/')) return <EnterpriseInterviewBuilder step={route.slice('builder/'.length)} />;

  return <UnknownEnterpriseScreen />;
}
