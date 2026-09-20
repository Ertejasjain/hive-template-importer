export type CommentType = 'info' | 'limitation' | 'defect';
export type Severity = 'low' | 'medium' | 'high';

export interface ParsedPhoto {
  url: string;
  caption: string;
}

export interface ParsedComment {
  name: string;
  body_html: string;
  body_text: string;
  comment_type: CommentType;
  severity: Severity | null;
  recommendation: string | null;
  answer_type: string | null;
  choices: string[];
  unit_types: string[];
  default_value: string | null;
  default_value_2: string | null;
  default_unit_type: string | null;
  default_location: string | null;
  estimate_min: number | null;
  estimate_max: number | null;
  locked: boolean;
  simple_format: boolean;
  disable_photos: boolean;
  uses: number;
  photos: ParsedPhoto[];
  position: number;
  source_row: number;
}

export interface ParsedItem {
  name: string;
  position: number;
  comments: ParsedComment[];
}

export interface ParsedSection {
  name: string;
  position: number;
  items: ParsedItem[];
}

export interface ImportIssue {
  severity: 'warning' | 'skipped';
  code: string;
  message: string;
  source_row?: number;
  column_name?: string;
  raw_value?: string;
}

export interface ParseResult {
  templateName: string;
  sections: ParsedSection[];
  issues: ImportIssue[];
  stats: {
    rowsTotal: number;
    rowsImported: number;
    rowsSkipped: number;
    sections: number;
    items: number;
    comments: number;
  };
}

/** Thrown when the file cannot be read as a template at all. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}
