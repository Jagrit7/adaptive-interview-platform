import { PracticeShell } from '@/components/practice/PracticeShell';
import { SkillPathDetail } from '@/components/practice/SkillPathDetail';
import { DSA_INTERVIEW_PRESET } from '@/lib/interviewPresets/dsa';

import { DSA_SKILL_PATH } from '@/lib/skillPaths/dsa';

export default function DsaSkillPathPage() {
  const interviewer = DSA_INTERVIEW_PRESET.agents[0];

  return (
    <PracticeShell>
      <SkillPathDetail
        eyebrow={DSA_SKILL_PATH.eyebrow}
        title={DSA_SKILL_PATH.title}
        description={DSA_SKILL_PATH.description}
        level={DSA_SKILL_PATH.level}
        modules={DSA_SKILL_PATH.modules}
        interviewer={{
          name: interviewer.identity.name,
          format: 'one timed coding challenge and one code-specific verbal follow-up',
          competencies: interviewer.scoring.competencies,
          launchHref: '/skills/dsa/interview/setup',
        }}
      />
    </PracticeShell>
  );
}
