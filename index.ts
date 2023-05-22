import {
  MemberFieldType,
  OldUserField,
  OldUserMember,
  PrismaClient,
  UserRole,
  Visibility,
} from "@prisma/client";
import axios from "axios";
import { PluralUserEntry } from "./types/rest/user";
import slugify from "slugify";
import { PluralMemberEntry } from "./types/rest/members";

const client = new PrismaClient();

const $axios = axios.create({
  baseURL: "https://v2.apparyllis.com/v1",
});

export const generateRandomString = (length: number) => {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

export const createSlug = (name: string) =>
  `${generateRandomString(6)}-${slugify(name, {
    lower: true,
  })}`;

export const parseFieldType = (fieldInfo: { type: number }): MemberFieldType =>
  [
    MemberFieldType.String,
    MemberFieldType.Color,
    MemberFieldType.Date,
    MemberFieldType.Month,
    MemberFieldType.Year,
    MemberFieldType.MonthYear,
    MemberFieldType.Timestamp,
    MemberFieldType.MonthDay,
  ][fieldInfo.type];

export const migrate = async () => {
  const users = await client.oldUser.findMany();

  for (const user of users) {
    let pluralSystem: PluralUserEntry | null = null;
    let oldMembers: (Omit<OldUserMember, "id" | "slug"> & { id: string | null, slug: string })[] = [];
    let oldFields: (Omit<OldUserField, "id"> & {
      id: string | null;
      position: number;
      type: MemberFieldType;
      name: string;
    })[] = [];

    try {
      pluralSystem = user.pluralKey
        ? (
            await $axios.request({
              url:
                user.admin && user.overridePluralId
                  ? `/user/${user.overridePluralId}`
                  : "/me",
              method: "GET",
              headers: {
                Authorization: user.pluralKey,
              },
            })
          ).data
        : null;

      if (!pluralSystem?.content.isAsystem) {
        pluralSystem = null;
        throw new Error(); // null out token/override
      }

      if (pluralSystem) {
        const pluralMembers: PluralMemberEntry[] =
          (
            await $axios.request({
              url: `/members/${pluralSystem.id}`,
              method: "GET",
              headers: {
                Authorization: user.pluralKey,
              },
            })
          ).data ?? [];

        for (const pluralMember of pluralMembers) {
            let oldMember:
            | (Omit<OldUserMember, "id" | "slug"> & { id: string | null, slug: string })
            | null
          
            const old = await client.oldUserMember.findFirst({
            where: {
              pluralId: pluralMember.id,
              pluralOwnerId: pluralSystem.id,
            },
          });

          if (!old) {
            oldMember = {
              id: null,
              pluralId: pluralMember.id,
              pluralOwnerId: pluralSystem.id,
              userId: user.id,
              slug: createSlug(pluralMember.content.name),
              visible:
                !pluralMember.content.preventTrusted &&
                !pluralMember.content.private,
              backgroundType: "Color",
              backgroundColor: null,
              backgroundImage: null,
              customDescription: null,
              lastTimeAssetChanged: new Date(),
            };
          } else {
            oldMember = {
                ...old,
                slug: old.slug ?? createSlug(pluralMember.content.name)
            }
          }

          oldMembers.push(oldMember);
        }

        for (const pluralId in pluralSystem.content.fields) {
          const pluralField = pluralSystem.content.fields[pluralId];

          const oldField = await client.oldUserField.findFirst({
            where: {
              pluralId,
            },
          });

          if (oldField) {
            oldFields.push({
              ...oldField,
              name: pluralField.name,
              position: pluralField.order,
              type: parseFieldType(pluralField),
            });
          } else {
            oldFields.push({
              id: null,
              pluralId,
              userId: user.id,
              name: pluralField.name,
              pluralOwnerId: pluralSystem.id,
              visible: !pluralField.private && !pluralField.preventTrusted,
              position: pluralField.order,
              type: parseFieldType(pluralField),
            });
          }
        }
      }
    } catch {
      user.pluralKey = null;
      user.overridePluralId = null;
    }

    await client.user.create({
      data: {
        id: user.id,
        passwordHash: user.passwordHash,
        pluralAccessToken: user.pluralKey,
        pluralOverride: user.admin ? user.overridePluralId : null,
        username: user.username,
        role: user.admin ? UserRole.Admin : UserRole.User,
        system: pluralSystem
          ? {
              create: {
                pluralId: pluralSystem.id,
                slug: user.slug ?? createSlug(pluralSystem.content.username),
                visibility: user.visible
                  ? Visibility.Public
                  : Visibility.Private,
                description: user.customDescription,
                assetsUpdatedAt: user.lastTimeAssetChanged ?? new Date(),
                backgroundColor: user.backgroundColor,
                backgroundImage: user.backgroundImage,
                backgroundType: user.backgroundType,
                members: {
                  createMany: {
                    data: oldMembers.map((old) => ({
                      id: old.id ?? undefined,
                      slug: old.slug,
                      pluralId: old.pluralId,
                      pluralParentId: old.pluralOwnerId,
                      visibility: old.visible
                        ? Visibility.Public
                        : Visibility.Private,
                      backgroundType: old.backgroundType,
                      backgroundColor: old.backgroundColor,
                      backgroundImage: old.backgroundImage,
                      description: old.customDescription,
                      assetsUpdatedAt: old.lastTimeAssetChanged ?? new Date(),
                    })),
                  },
                },
                fields: {
                  createMany: {
                    data: oldFields.map((old) => ({
                      id: old.id ?? undefined,
                      pluralId: old.pluralId,
                      pluralParentId: old.pluralOwnerId,
                      name: old.name,
                      position: old.position,
                      type: old.type,
                      visibility: old.visible
                        ? Visibility.Public
                        : Visibility.Private,
                    })),
                  },
                },
              },
            }
          : undefined,
      },
    });
  }
};
