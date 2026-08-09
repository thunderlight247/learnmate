# LearnMate

LearnMate is an AI-powered study assistant designed for students who want to learn faster from lecture PDFs. The application extracts text from uploaded documents, summarizes the material, answers context-based questions, and generates short practice quizzes based only on the provided content.

## Why LearnMate

Students often spend too much time reading long lecture notes and trying to turn them into revision material. LearnMate helps by turning a PDF into a structured study workflow:

- summarize the lecture in plain language
- highlight the key concepts and important topics
- answer questions grounded in the uploaded document
- generate quiz questions for self-testing

The app is intentionally built to keep the AI answers tied to the uploaded material, reducing hallucinations and making the study experience more reliable.

## Features

- PDF upload and validation
- Text extraction from lecture material
- AI-generated document summary
- Key concepts and topic extraction
- Question answering using uploaded lecture context
- Practice quiz generation with multiple-choice questions
- Simple dashboard interface for studying and revision

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- OpenRouter API integration
- PDF text extraction via unpdf

## Project Structure

```bash
src/
├── app/
│   ├── api/
│   │   ├── analyze/
│   │   ├── chat/
│   │   └── quiz/
│   └── page.tsx
├── components/
├── lib/
├── types/
└── globals.css
```

## Getting Started

### Prerequisites

- Node.js 20 or newer
- npm or pnpm
- An OpenRouter API key

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env.local` file in the project root and add:

```bash
OPENROUTER_API_KEY=your_api_key_here
OPENROUTER_MODEL=anthropic/claude-3-haiku
```

You can change the model to any compatible OpenRouter model if needed.

### 3. Run the app locally

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Application Flow

1. Upload a lecture PDF.
2. The app extracts readable text from the document.
3. The extracted text is sent to the AI for analysis.
4. The dashboard shows:
   - a document summary
   - important concepts and topics
   - an AI chat panel for questions
   - a quiz generator for revision

## API Endpoints

### POST /api/analyze

Accepts a PDF file and returns:

- summary
- key concepts
- important topics
- raw extracted text for follow-up interactions

### POST /api/chat

Accepts a user question and lecture context, then returns an answer based on the uploaded material.

### POST /api/quiz

Accepts lecture context and generates a multiple-choice quiz in JSON format.

## Notes

- The app is designed to stay grounded in the uploaded lecture content.
- For best results, use clear, readable PDFs with text-based content.
- AI answers may still depend on the chosen model and the quality of the uploaded document.

## Future Improvements

- improved PDF parsing for scanned or image-heavy documents
- saved study sessions and revision history
- stronger quiz quality filters and scoring feedback
- multi-document comparison and cross-topic analysis

## Contribution

This project is intended as a practical study assistant and can be extended with new features such as notes, flashcards, or deeper academic analysis tools.
