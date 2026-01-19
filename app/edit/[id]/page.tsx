import { requireAuth } from '@/lib/auth'
import { getFileById } from '../actions'
import { EditFileClient } from './edit-file-client'

async function getCourseList(): Promise<string[]> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_R2_DATA_SITE_URL}/metadata.json`);
    const data = await response.json() as { courses?: string[] }
    return data.courses || []
  } catch (error) {
    console.error('Failed to fetch course list:', error)
    return []
  }
}

interface EditFilePageProps {
  params: Promise<{ id: string }>
}

export default async function EditFilePage({ params }: EditFilePageProps) {
  const { id } = await params
  await requireAuth(`/edit/${id}`)
  
  // Fetch file data and course list
  const [fileChange, courseList] = await Promise.all([
    getFileById(id),
    getCourseList()
  ])

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <EditFileClient fileChange={fileChange} courseList={courseList} />
    </div>
  )
}
