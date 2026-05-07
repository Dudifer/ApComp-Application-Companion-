import {
  Document, Page, Text, View, StyleSheet, Font, Link,
} from '@react-pdf/renderer';
import type { ResumeState } from './useResumeBuilder';

// Register fonts for a clean professional look
Font.register({
  family: 'Garamond',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/ebgaramond/v26/SlGDmQSNjdsmc35JDF1K5E55YMjF_7DPuGi-6_RUA4V-e6yHgQ.woff2', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/ebgaramond/v26/SlGFmQSNjdsmc35JDF1K5GR3OjCv_BQn13fUhpo4TzY.woff2', fontWeight: 700 },
  ],
});

Font.register({
  family: 'OpenSans',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/opensans/v40/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjZ0B4uaVoUwaEQbjA.woff2', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/opensans/v40/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsg-1x4uaVoUwaEQbjA.woff2', fontWeight: 700 },
  ],
});

const s = StyleSheet.create({
  page: {
    fontFamily: 'OpenSans',
    fontSize: 9.5,
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 48,
    color: '#1a1814',
    lineHeight: 1.4,
  },

  // Header
  headerName: {
    fontFamily: 'Garamond',
    fontSize: 24,
    fontWeight: 700,
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 10,
    textAlign: 'center',
    color: '#555',
    marginBottom: 6,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerContact: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 4,
    fontSize: 8.5,
    color: '#444',
    marginBottom: 12,
  },
  contactItem: {
    marginHorizontal: 4,
  },
  contactSep: {
    color: '#aaa',
  },

  // Section
  sectionHeader: {
    fontFamily: 'Garamond',
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1814',
    paddingBottom: 2,
    marginBottom: 6,
    marginTop: 10,
  },

  // Experience
  expHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 1,
  },
  expCompany: {
    fontWeight: 700,
    fontSize: 10,
  },
  expLocation: {
    fontSize: 9,
    color: '#555',
  },
  expTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  expTitle: {
    fontStyle: 'italic',
    fontSize: 9.5,
    color: '#333',
  },
  expDates: {
    fontSize: 9,
    color: '#555',
  },
  bullet: {
    flexDirection: 'row',
    marginBottom: 2,
    paddingLeft: 8,
  },
  bulletDot: {
    width: 10,
    fontSize: 9,
    color: '#333',
  },
  bulletText: {
    flex: 1,
    fontSize: 9,
    color: '#222',
    lineHeight: 1.45,
  },
  expBlock: {
    marginBottom: 8,
  },

  // Education
  eduHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 1,
  },
  eduInstitution: {
    fontWeight: 700,
    fontSize: 10,
  },
  eduLocation: {
    fontSize: 9,
    color: '#555',
  },
  eduDegreeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eduDegree: {
    fontStyle: 'italic',
    fontSize: 9.5,
    color: '#333',
  },
  eduDates: {
    fontSize: 9,
    color: '#555',
  },

  // About
  aboutText: {
    fontSize: 9,
    color: '#222',
    lineHeight: 1.5,
  },

  // Skills
  skillRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  skillLabel: {
    fontWeight: 700,
    fontSize: 9,
    width: 140,
  },
  skillValue: {
    flex: 1,
    fontSize: 9,
    color: '#222',
  },

  // Projects
  projectBullet: {
    flexDirection: 'row',
    marginBottom: 3,
    paddingLeft: 4,
  },
});

function formatDate(d: string): string {
  if (!d) return '';
  const [y, m] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m) - 1] ?? ''} ${y}`;
}

interface Props {
  state: ResumeState;
}

export function ResumePdfTemplate({ state }: Props) {
  const { header, aboutMe, education, experience, projects, skillGroups } = state;

  const activeExp = experience.filter(e => e.active);
  const activeProjects = projects.filter(p => p.active);
  const activeSkills = skillGroups.filter(sg => sg.active);
  const activeEdu = education.filter(e => e.active);

  const contactParts = [
    header.phone,
    header.email,
    header.linkedin,
    header.github,
  ].filter(Boolean);

  return (
    <Document>
      <Page size="LETTER" style={s.page}>

        {/* Header */}
        <Text style={s.headerName}>{header.name}</Text>
        <Text style={s.headerTitle}>{header.title}</Text>
        <View style={s.headerContact}>
          {contactParts.map((part, i) => (
            <View key={i} style={{ flexDirection: 'row' }}>
              {i > 0 && <Text style={s.contactSep}> | </Text>}
              <Text style={s.contactItem}>{part}</Text>
            </View>
          ))}
        </View>

        {/* Education */}
        {activeEdu.length > 0 && (
          <View>
            <Text style={s.sectionHeader}>Education</Text>
            {activeEdu.map(edu => (
              <View key={edu.id}>
                <View style={s.eduHeader}>
                  <Text style={s.eduInstitution}>{edu.institution}</Text>
                  <Text style={s.eduLocation}>{edu.location}</Text>
                </View>
                <View style={s.eduDegreeRow}>
                  <Text style={s.eduDegree}>{edu.degree}</Text>
                  <Text style={s.eduDates}>{edu.dates}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* About Me */}
        {aboutMe && (
          <View>
            <Text style={s.sectionHeader}>About Me</Text>
            <Text style={s.aboutText}>{aboutMe}</Text>
          </View>
        )}

        {/* Work Experience */}
        {activeExp.length > 0 && (
          <View>
            <Text style={s.sectionHeader}>Work Experience</Text>
            {activeExp.map(exp => {
              const activeBullets = exp.bullets.filter(b => b.active);
              return (
                <View key={exp.id} style={s.expBlock}>
                  <View style={s.expHeader}>
                    <Text style={s.expCompany}>{exp.title}</Text>
                    <Text style={s.expDates}>
                      {formatDate(exp.startDate)} - {exp.endDate ? formatDate(exp.endDate) : 'Present'}
                    </Text>
                  </View>
                  <View style={s.expTitleRow}>
                    <Text style={s.expTitle}>{exp.company}</Text>
                    <Text style={s.expLocation}>{exp.location ?? ''}</Text>
                  </View>
                  {activeBullets.map(b => (
                    <View key={b.id} style={s.bullet}>
                      <Text style={s.bulletDot}>•</Text>
                      <Text style={s.bulletText}>{b.text}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        )}

        {/* Personal Projects */}
        {activeProjects.length > 0 && (
          <View>
            <Text style={s.sectionHeader}>Personal Projects</Text>
            {activeProjects.map(p => (
              <View key={p.id} style={s.projectBullet}>
                <Text style={s.bulletDot}>•</Text>
                <Text style={s.bulletText}>{p.text}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Technical Skills */}
        {activeSkills.length > 0 && (
          <View>
            <Text style={s.sectionHeader}>Technical Skills</Text>
            {activeSkills.map(sg => (
              <View key={sg.id} style={s.skillRow}>
                <Text style={s.skillLabel}>{sg.label}:</Text>
                <Text style={s.skillValue}>{sg.skills}</Text>
              </View>
            ))}
          </View>
        )}

      </Page>
    </Document>
  );
}
