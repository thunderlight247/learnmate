import '@/lib/polyfills';
import { extractText, getDocumentProxy } from 'unpdf';

// Converts a PDF file buffer into plain text before it is sent to the AI.
// This step is critical because the app relies on reliable lecture text for summaries, questions, and quizzes.
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // Convert Node Buffer to Uint8Array required by unpdf
    const uint8Array = new Uint8Array(buffer);
    
    // Load document proxy
    const pdf = await getDocumentProxy(uint8Array);
    
    // Extract text across all pages
    const { text } = await extractText(pdf, { mergePages: true });

    return text?.trim() ?? '';
  } catch (error) {
    console.error('PDF Parsing Error:', error);
    throw new Error('Failed to extract text from the PDF file.');
  }
}