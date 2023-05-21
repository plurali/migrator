import { BaseEntry, VisibilityAttributes } from '.';

export type PluralUserEntry = BaseEntry<UserContent>;

export interface UserCustomField extends VisibilityAttributes {
  name: string;
  order: number;
  type: number;
}

export interface UserContent {
  isAsystem: true;
  lastUpdate: number;
  uid: string;
  username: string;
  fields: Record<string, UserCustomField>;
  color: string;
  desc: string;
  avatarUuid: string;
  avatarUrl: string;
  lastOperationTime: number;
  supportDescMarkdown: boolean;
}