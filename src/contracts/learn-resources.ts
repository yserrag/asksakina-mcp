/**
 * WO#495 (MCP 2.5.0): the six resources the two journey prompts read. The bodies are
 * generated (learn-content.ts, from the app's seed modules and the rulings in
 * docs/wo495-architect.md); the names, titles and descriptions are the Builder's (Gem 10 PASS, G10-5).
 */
import { LEARN_RESOURCE_BODIES } from './learn-content.js'

const META = [
  ['learn-what-muslims-believe', 'sakina://learn/what-muslims-believe', 'What Muslims believe', 'The six articles of faith and the five pillars, with Sunni and Shia and a note on hard questions. Read by the what_muslims_believe prompt.'],
  ['learn-first-steps-shahada', 'sakina://learn/first-steps#shahada', 'First steps: the shahada', 'The testimony of faith in Arabic, with transliteration, translation and source. Read by first_steps_new_muslim, step 1.'],
  ['learn-first-steps-forgiven', 'sakina://learn/first-steps#forgiven', 'First steps: what has passed is forgiven', 'Quran 8:38 and Sahih Muslim 121 on the past being forgiven. Read by first_steps_new_muslim, step 2.'],
  ['learn-first-steps-wudu', 'sakina://learn/first-steps#wudu', 'First steps: wudu', 'The obligatory and recommended parts of wudu, with where the schools differ. Read by first_steps_new_muslim, step 3.'],
  ['learn-first-steps-first-prayer', 'sakina://learn/first-steps#first-prayer', 'First steps: the first prayer', 'The five daily prayers and one rakah step by step, with where the schools differ. Read by first_steps_new_muslim, step 3.'],
  ['learn-first-steps-community', 'sakina://learn/first-steps#community', 'First steps: your people', 'Finding a Muslim community, and when to ask a qualified local scholar or imam. Read by first_steps_new_muslim, step 4.'],
] as const

export const LEARN_RESOURCES = META.map(([name, uri, title, description]) => {
  const text = LEARN_RESOURCE_BODIES[uri]
  if (!text) throw new Error(`learn-resources: no body for ${uri}`)
  return { name, uri, title, description, text }
})

if (LEARN_RESOURCES.length !== Object.keys(LEARN_RESOURCE_BODIES).length) throw new Error('learn-resources: a body has no metadata')
