import { supabase } from './supabaseClient';

export interface CompetencyResult { name:string; score:number; threshold:number; weight:number; covered:boolean; checked_by:string[]; used_default_rule:boolean }
export interface AgentReport { agent_id:string; name:string; role:string; visits:number; questions_answered:number; satisfaction:number; score?:number; weight?:number; force_closed:boolean; competencies:string[]; knowledge_questions_asked:number; knowledge_questions_total:number }
export interface TranscriptEntry { turn:number; speaker:string; agent_id:string; agent_name:string; text:string; flags:string[]; coverage:number|null; knowledge_item_id:string|null; question_score?:number|null }
export interface ReportTotals { overall_score:number; band:string; competencies_total:number; competencies_covered:number; coverage_rate:number; knowledge_coverage:number|null; questions_answered:number; flags:Record<string,number> }
export interface InterviewReport { session_id:string; candidate_name:string; candidate_ref:string; panel_name:string; language:string; started_at:string; finished_at:string; completed:boolean; totals:ReportTotals; competencies:CompetencyResult[]; agents:AgentReport[]; transcript:TranscriptEntry[] }

export interface ReportSummary {
  id:string; candidate_name:string; candidate_ref:string; panel_name:string; role_name:string;
  overall_score:number|null; band:string|null; recommendation:string; completed:boolean;
  created_at:string; finished_at:string|null;
}

export interface ReportRecord extends ReportSummary {
  executive_summary:string; strengths:string[]; growth_areas:string[]; report:InterviewReport;
}

export interface ReportQuery { limit:number; metric:'overall'|'competency'; competency?:string; role?:string }
export interface RankedReport extends ReportSummary { matched_score:number|null; matched_metric:string }

const recommendationFor = (band:string|null) => band === 'Strong' ? 'Strong Hire' : band === 'Solid' ? 'Hire' : band === 'Developing' ? 'Consider' : 'Needs Review';
const scoreText = (score:number) => `${Math.round(score*100)}/100`;
const normalizedKey = (value:string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');

function presentation(report:InterviewReport, roleName?:string) {
  const sorted=[...report.competencies].sort((a,b)=>b.score-a.score);
  const strengths=sorted.filter(item=>item.covered).slice(0,3).map(item=>`${item.name} was a demonstrated strength (${scoreText(item.score)}).`);
  const growth=[...sorted].reverse().filter(item=>!item.covered).slice(0,3).map(item=>`${item.name} needs further evidence or improvement (${scoreText(item.score)}).`);
  const recommendation=recommendationFor(report.totals.band);
  const role=roleName?.trim() || report.panel_name;
  return {
    role,
    recommendation,
    strengths: strengths.length ? strengths : ['The candidate completed the assessed interview areas.'],
    growth: growth.length ? growth : ['Continue validating performance in a subsequent interview round.'],
    summary: `${report.candidate_name || 'The candidate'} scored ${scoreText(report.totals.overall_score)} in the ${report.panel_name} interview. The evidence supports a ${recommendation} recommendation for ${role}. ${report.totals.competencies_covered} of ${report.totals.competencies_total} measured competencies met their configured thresholds.`,
  };
}

export function generateCandidateRef():string {
  const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; const bytes=new Uint8Array(6); crypto.getRandomValues(bytes);
  return `AIP-${Array.from(bytes,b=>alphabet[b%alphabet.length]).join('')}`;
}

export async function saveReport(report:InterviewReport,panelId:string|null,roleName?:string):Promise<string> {
  const {data:userData,error:userErr}=await supabase.auth.getUser();
  if(userErr||!userData.user) throw new Error('You are signed out, so the report could not be saved.');
  const view=presentation(report,roleName);
  const {data,error}=await supabase.from('interview_reports').upsert({
    user_id:userData.user.id,panel_id:panelId,candidate_name:report.candidate_name,candidate_ref:report.candidate_ref,
    session_id:report.session_id,panel_name:report.panel_name,role_name:view.role,language:report.language,
    overall_score:report.totals.overall_score,band:report.totals.band,recommendation:view.recommendation,
    executive_summary:view.summary,strengths:view.strengths,growth_areas:view.growth,completed:report.completed,
    started_at:report.started_at||null,finished_at:report.finished_at||null,report_version:1,report,
  },{onConflict:'user_id,session_id'}).select('id').single();
  if(error) throw new Error(`Could not save the report: ${error.message}`);
  return (data as {id:string}).id;
}

const SUMMARY_COLUMNS='id,candidate_name,candidate_ref,panel_name,role_name,overall_score,band,recommendation,completed,created_at,finished_at';

export async function listReports():Promise<ReportSummary[]> {
  const {data,error}=await supabase.from('interview_reports').select(SUMMARY_COLUMNS).order('created_at',{ascending:false});
  if(error) throw new Error(`Could not load reports: ${error.message}`);
  return (data??[]) as ReportSummary[];
}

export async function loadReportRecord(id:string):Promise<ReportRecord> {
  const {data,error}=await supabase.from('interview_reports').select(`${SUMMARY_COLUMNS},executive_summary,strengths,growth_areas,report`).eq('id',id).single();
  if(error) throw new Error(`Could not open that report: ${error.message}`);
  const row=data as ReportRecord; const fallback=presentation(row.report,row.role_name);
  return {...row,role_name:row.role_name||fallback.role,recommendation:row.recommendation||fallback.recommendation,executive_summary:row.executive_summary||fallback.summary,strengths:row.strengths?.length?row.strengths:fallback.strengths,growth_areas:row.growth_areas?.length?row.growth_areas:fallback.growth};
}

export async function loadReport(id:string):Promise<InterviewReport> { return (await loadReportRecord(id)).report; }

export async function queryCandidateReports(query:ReportQuery):Promise<RankedReport[]> {
  const limit=Math.max(1,Math.min(20,query.limit));
  if(query.metric==='overall') {
    let request=supabase.from('interview_reports').select(SUMMARY_COLUMNS).eq('completed',true).order('overall_score',{ascending:false}).limit(limit);
    if(query.role) request=request.ilike('role_name',`%${query.role}%`);
    const {data,error}=await request; if(error) throw new Error(`Could not query reports: ${error.message}`);
    return ((data??[]) as ReportSummary[]).map(row=>({...row,matched_score:row.overall_score,matched_metric:'Overall score'}));
  }
  const key=normalizedKey(query.competency??'');
  let request=supabase.from('interview_report_scores').select(`score,competency_name,interview_reports!inner(${SUMMARY_COLUMNS})`).eq('competency_key',key).order('score',{ascending:false}).limit(limit);
  if(query.role) request=request.ilike('interview_reports.role_name',`%${query.role}%`);
  const {data,error}=await request; if(error) throw new Error(`Could not query competency scores: ${error.message}`);
  return (data??[]).map((item:Record<string,unknown>)=>{
    const nested=(Array.isArray(item.interview_reports)?item.interview_reports[0]:item.interview_reports) as ReportSummary;
    return {...nested,matched_score:Number(item.score),matched_metric:String(item.competency_name)};
  });
}
