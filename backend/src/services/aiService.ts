import OpenAI from 'openai'
import fs from 'fs/promises'
import path from 'path'
import { getRecentMessages, getRecentPlays } from '../db'

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export interface AIProvider {
  name: string
  chat(messages: ChatMessage[]): Promise<string>
}

class ClaudeProvider implements AIProvider {
  name = 'claude'
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: 'https://api.anthropic.com/v1',
      dangerouslyAllowBrowser: true
    })
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: 'claude-sonnet-4-20250514',
      messages,
      max_tokens: 1024
    })
    return response.choices[0]?.message?.content || ''
  }
}

class GLMProvider implements AIProvider {
  name = 'glm'
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.GLM_API_KEY,
      baseURL: process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4'
    })
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: 'glm-4',
      messages,
      max_tokens: 1024
    })
    return response.choices[0]?.message?.content || ''
  }
}

let aiProvider: AIProvider

const PROMPTS_DIR = path.join(process.cwd(), '../prompts')
const USER_DIR = path.join(process.cwd(), '../user')

async function loadFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return ''
  }
}

export function initAIProvider() {
  const provider = process.env.AI_PROVIDER || 'claude'
  if (provider === 'glm') {
    aiProvider = new GLMProvider()
  } else {
    aiProvider = new ClaudeProvider()
  }
  console.log(`AI Provider initialized: ${aiProvider.name}`)
}

export async function buildSystemPrompt(): Promise<string> {
  const [persona, taste, routines] = await Promise.all([
    loadFile(path.join(PROMPTS_DIR, 'dj-persona.md')),
    loadFile(path.join(USER_DIR, 'taste.md')),
    loadFile(path.join(USER_DIR, 'routines.md'))
  ])

  const parts: string[] = []

  if (persona) {
    parts.push(persona)
  }

  if (taste) {
    parts.push(`\n## User Taste Profile\n\n${taste}`)
  }

  if (routines) {
    parts.push(`\n## User Daily Routines\n\n${routines}`)
  }

  return parts.join('\n')
}

export async function handleChat(message: string): Promise<{ response: string }> {
  if (!aiProvider) {
    initAIProvider()
  }

  const systemPrompt = await buildSystemPrompt()

  // Build conversation history
  const recentMessages = getRecentMessages(10)
  const recentPlays = getRecentPlays(10)

  const contextLines: string[] = []
  if (recentPlays.length > 0) {
    contextLines.push('Recent plays (avoid repeating these):')
    recentPlays.forEach(p => {
      contextLines.push(`- ${p.trackName} by ${p.artist}`)
    })
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt }
  ]

  // Add conversation history
  for (const msg of recentMessages) {
    messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content })
  }

  // Add context about recent plays
  if (contextLines.length > 0) {
    messages.push({
      role: 'system',
      content: contextLines.join('\n')
    })
  }

  messages.push({ role: 'user', content: message })

  const response = await aiProvider.chat(messages)
  return { response }
}
