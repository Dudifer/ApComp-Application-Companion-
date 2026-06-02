import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer';
import type { ResumeState } from '../hooks/useResumeBuilder';

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 36,
    color: '#1a1814',
    lineHeight: 1.4,
  },
/* Header Format */ 
  headerName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 22,
    textAlign: 'center',
    letterSpacing: 1.0,
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 10,
    textAlign: 'center',
    color: '#555',
    marginBottom: 6,
    letterSpacing: 1,
    paddingTop: 2,
  },
  headerContact: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    fontSize: 8,
    color: '#444',
    marginBottom: 8,
  },
  contactItem: { marginHorizontal: 4 },
  contactSep: { color: '#aaa' },
  sectionHeader: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1814',
    paddingBottom: 2,
    marginBottom: 6,
    marginTop: 10,
  },
/* Experience Format */ 
  expBlock: { marginBottom: 6 },
  expHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 1,
  },
  expTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  expDates: { fontSize: 9, color: '#555' },
  expCompanyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  expCompany: { fontFamily: 'Helvetica-Oblique', fontSize: 9.5, color: '#333' },
  expLocation: { fontSize: 9, color: '#555' },
  bullet: { flexDirection: 'row', marginBottom: 0, paddingLeft: 8, flexWrap: 'wrap' },
  bulletDot: { width: 10, fontSize: 9, color: '#333' },
  bulletText: { flex: 1, fontSize: 9, color: '#222', lineHeight: 1.45, flexWrap: 'wrap' },

  /* Project Format */ 
  projBlock: { marginBottom: 6 },
  projHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 1,
  },
  projNameRow: { flexDirection: 'row', flexWrap: 'wrap', flex: 1 },
  projName: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  projSep: { fontSize: 10, color: '#555', marginHorizontal: 3 },
  projCategory: { fontSize: 10, color: '#333' },
  projDate: { fontSize: 9, color: '#555', flexShrink: 0 },
  
  projTechStack: {
    fontFamily: 'Helvetica-Oblique',
    fontSize: 9,
    color: '#444',
    marginBottom: 3,
  },

  /* Education Format */

  eduHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 1,
  },
  eduInstitution: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  eduLocation: { fontSize: 9, color: '#555' },
  eduDegreeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  eduDegree: { fontFamily: 'Helvetica-Oblique', fontSize: 9.5, color: '#333' },
  eduDates: { fontSize: 9, color: '#555' },
  aboutText: { fontSize: 9, color: '#222', lineHeight: 1.5 },
  
  skillRow: { flexDirection: 'row', marginBottom: 3 },
  skillLabel: { fontFamily: 'Helvetica-Bold', fontSize: 9, width: 140 },
  skillValue: { flex: 1, fontSize: 9, color: '#222' },
});

function formatDate(d?: string): string {
  if (!d) return '';
  if (!d.includes('-')) return d; // already "Fall 2022" etc
  const [y, m] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m) - 1] ?? ''} ${y}`;
}

interface Props { state: ResumeState; }

export function ResumePdfTemplate({ state }: Props) {
  const { header, aboutMe, education, experience, projects, skillGroups } = state;

  
  const activeExp = experience.filter(e => e.active);
  const activeProjects = projects.filter(p => p.active);
  const activeSkills = skillGroups.filter(sg => sg.active);
  const activeEdu = education.filter(e => e.active);
  const contactParts = [header.phone, header.email, header.linkedin, header.github].filter(Boolean);

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
        {aboutMe ? (
          <View>
            <Text style={s.sectionHeader}>About Me</Text>
            <Text style={s.aboutText}>{aboutMe}</Text>
          </View>
        ) : null}

        {/* Work Experience */}
        {activeExp.length > 0 && (
          <View>
            <Text style={s.sectionHeader}>Work Experience</Text>
            {activeExp.map(exp => {
              const activeBullets = exp.bullets.filter(b => b.active);
              return (
                <View key={exp.id} style={s.expBlock}>
                  <View style={s.expHeader}>
                    <Text style={s.expTitle}>{exp.title}</Text>
                    <Text style={s.expDates}>
                      {formatDate(exp.startDate)} - {exp.endDate ? formatDate(exp.endDate) : 'Present'}
                    </Text>
                  </View>
                  <View style={s.expCompanyRow}>
                    <Text style={s.expCompany}>{exp.company}</Text>
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
            {activeProjects.map(proj => {
              const activeBullets = proj.bullets.filter(b => b.active);
              return (
                <View key={proj.id} style={s.projBlock}>
                  {/* Name | Category          Date */}
                  <View style={s.projHeader}>
                    <View style={s.projNameRow}>
                      <Text style={s.projName}>{proj.name}</Text>
                      {proj.category && (
                        <>
                          <Text style={s.projSep}> | </Text>
                          <Text style={s.projCategory}>{proj.category}</Text>
                        </>
                      )}
                    </View>
                    {proj.date && <Text style={s.projDate}>{proj.date}</Text>}
                  </View>
                  {/* Tech stack italic */}
                  {proj.techStack && (
                    <Text style={s.projTechStack}>{proj.techStack}</Text>
                  )}
                  {/* Bullets */}
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