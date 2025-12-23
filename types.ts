
export interface WordList {
  id: string;
  name: string;
  words: string[];
  createdAt: number;
}

export interface AppState {
  lists: WordList[];
  currentStudyListId: string | null;
  isStudying: boolean;
}
