/**
 * @file storageService.js
 * @description Local-first persistence service with schema versioning, case indexing, and privacy guarantees.
 * 
 * PRIVACY GUARANTEE:
 * All genetic and family pedigree records are saved exclusively to the client's local browser storage.
 * No data is ever transmitted to remote telemetry or external third-party servers.
 */

import { CURRENT_SCHEMA_VERSION, validatePedigreeData, sanitizeAndRepairPedigree } from '../domain/pedigreeValidation.js';

const STORAGE_PREFIX = 'persian_pedigree_case_';
const INDEX_KEY = 'persian_pedigree_cases_index';

/**
 * Checks if browser storage is available.
 */
export function isStorageAvailable() {
  try {
    const testKey = '__pedigree_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lists all locally saved pedigree cases with metadata.
 * @returns {Array<{ id: string, title: string, updatedAt: string, personCount: number }>}
 */
export function listSavedCases() {
  if (!isStorageAvailable()) return [];
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const index = JSON.parse(raw);
    return Array.isArray(index) ? index : [];
  } catch (err) {
    console.error('Failed to list pedigree cases:', err);
    return [];
  }
}

/**
 * Saves a pedigree case locally.
 * 
 * @param {string} caseId Unique identifier for the case
 * @param {Object} data Pedigree dataset
 * @param {string} title Human-readable title
 * @returns {{ success: boolean, error?: string }}
 */
export function saveCaseLocally(caseId, data, title = 'شجره‌نامه ژنتیکی') {
  if (!isStorageAvailable()) {
    return { success: false, error: 'حافظه محلی مرورگر در دسترس نیست یا غیرفعال است.' };
  }

  try {
    const { sanitizedData } = sanitizeAndRepairPedigree(data);
    sanitizedData.schemaVersion = CURRENT_SCHEMA_VERSION;
    sanitizedData.metadata = {
      ...(sanitizedData.metadata || {}),
      caseId,
      title,
      updatedAt: new Date().toISOString(),
    };

    const payload = JSON.stringify(sanitizedData);
    localStorage.setItem(`${STORAGE_PREFIX}${caseId}`, payload);

    // Update index
    const index = listSavedCases().filter((c) => c.id !== caseId);
    index.unshift({
      id: caseId,
      title,
      updatedAt: new Date().toISOString(),
      personCount: Object.keys(sanitizedData.people || {}).length,
    });
    localStorage.setItem(INDEX_KEY, JSON.stringify(index.slice(0, 30)));

    return { success: true };
  } catch (err) {
    if (err && err.name === 'QuotaExceededError') {
      return { success: false, error: 'ظرفیت حافظه محلی مرورگر پر شده است. لطفاً برخی از پرونده‌های قدیمی را حذف کنید.' };
    }
    return { success: false, error: err?.message || 'خطا در ذخیره‌سازی محلی پرونده' };
  }
}

/**
 * Loads a saved case from local storage.
 * 
 * @param {string} caseId
 * @returns {{ success: boolean, data?: Object, error?: string }}
 */
export function loadCaseLocally(caseId) {
  if (!isStorageAvailable()) {
    return { success: false, error: 'حافظه محلی مرورگر در دسترس نیست.' };
  }

  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${caseId}`);
    if (!raw) {
      return { success: false, error: 'پرونده مورد نظر در حافظه مرورگر یافت نشد.' };
    }
    const parsed = JSON.parse(raw);
    const validation = validatePedigreeData(parsed);

    if (!validation.isValid) {
      const { sanitizedData } = sanitizeAndRepairPedigree(parsed);
      return { success: true, data: sanitizedData };
    }

    return { success: true, data: parsed };
  } catch (err) {
    return { success: false, error: err?.message || 'خطا در بارگذاری پرونده از حافظه' };
  }
}

/**
 * Deletes a saved case from local storage.
 * @param {string} caseId
 */
export function deleteCaseLocally(caseId) {
  if (!isStorageAvailable()) return;
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${caseId}`);
    const index = listSavedCases().filter((c) => c.id !== caseId);
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch (err) {
    console.error('Failed to delete case:', err);
  }
}
