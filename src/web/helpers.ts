// Web UI 辅助函数 - 从原始 web.ts 恢复的完整实现

import type * as schema from '../service/d1/schema'

export function buildEmptyState(): string {
    return `
        <tr>
            <td colspan="5" style="text-align: center; padding: var(--spacing-3xl); color: var(--color-secondary-label); background: var(--color-secondary-system-background);">
                <div style="display: flex; flex-direction: column; align-items: center; gap: var(--spacing-md);">
                    <svg style="width: 48px; height: 48px; color: var(--color-tertiary-label);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
                    </svg>
                    <p style="font-weight: var(--font-weight-medium); font-size: 17px;">No keys found</p>
                </div>
            </td>
        </tr>
    `
}

export function buildCopyableKey(key: string): string {
    const displayKey = `${key.substring(0, 4)}...${key.substring(key.length - 4)}`
    return `
        <div style="position: relative; display: inline-block;">
            <code style="padding: var(--spacing-sm) var(--spacing-md); background: var(--color-secondary-system-background); border: 0.5px solid var(--color-system-gray4); border-radius: var(--radius-md); font-size: 13px; font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Fira Mono', 'Droid Sans Mono', 'Consolas', monospace; color: var(--color-label); cursor: pointer; transition: all 0.2s ease; display: inline-block;"
                  onclick="copyToClipboard('${key.replace(/'/g, "\\'")}', this)"
                  onmouseover="this.style.backgroundColor='var(--color-tertiary-system-fill)'"
                  onmouseout="this.style.backgroundColor='var(--color-secondary-system-background)'"
                  title="Click to copy">
                <span style="font-family: inherit;">${displayKey}</span>
            </code>
            <div style="position: absolute; top: -32px; left: 50%; transform: translateX(-50%); background: var(--color-system-green); color: white; font-size: 12px; padding: var(--spacing-xs) var(--spacing-sm); border-radius: var(--radius-sm); opacity: 0; pointer-events: none; transition: opacity 0.3s ease; white-space: nowrap;" class="copy-tooltip">
                Copied!
            </div>
        </div>
    `
}

export function buildPaginationControls(
    provider: string,
    currentStatus: string,
    q: string,
    page: number,
    pageSize: number,
    total: number,
    sortBy: string,
    sortOrder: string
): string {
    const numPages = Math.ceil(total / pageSize)
    if (numPages <= 1) {
        return ''
    }

    const pageNumbers = generatePageNumbers(page, numPages)
    const prevPage = Math.max(1, page - 1)
    const nextPage = Math.min(numPages, page + 1)
    const prevDisabled = page <= 1
    const nextDisabled = page >= numPages

    const items = [
        buildPaginationButton('prev', prevPage, prevDisabled, provider, currentStatus, q, sortBy, sortOrder),
        ...pageNumbers.map(p => buildPageNumberButton(p, page, provider, currentStatus, q, sortBy, sortOrder)),
        buildPaginationButton('next', nextPage, nextDisabled, provider, currentStatus, q, sortBy, sortOrder)
    ]

    return items.join('')
}

function generatePageNumbers(currentPage: number, totalPages: number): (number | string)[] {
    const window = 2
    const pagesToShow = new Set<number>()

    pagesToShow.add(1)
    pagesToShow.add(totalPages)

    for (let i = Math.max(1, currentPage - window); i <= Math.min(totalPages, currentPage + window); i++) {
        pagesToShow.add(i)
    }

    const sortedPages = Array.from(pagesToShow).sort((a, b) => a - b)
    const pageItems: (number | string)[] = []
    let lastPage = 0

    for (const p of sortedPages) {
        if (lastPage > 0 && p > lastPage + 1) {
            pageItems.push('...')
        }
        pageItems.push(p)
        lastPage = p
    }

    return pageItems
}

function buildPaginationButton(
    type: 'prev' | 'next',
    targetPage: number,
    disabled: boolean,
    provider: string,
    status: string,
    q: string,
    sortBy: string,
    sortOrder: string
): string {
    const icon =
        type === 'prev'
            ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>'
            : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>'

    const link = buildPageLink(provider, status, q, targetPage, 20, sortBy, sortOrder)

    const baseStyles =
        'padding: var(--spacing-sm); border-radius: var(--radius-md); font-size: 15px; font-weight: var(--font-weight-medium); transition: all 0.2s ease; text-decoration: none; display: inline-flex; align-items: center; justify-content: center;'
    const disabledStyles =
        'background: var(--color-secondary-system-background); color: var(--color-quaternary-label); cursor: not-allowed; pointer-events: none; border: 0.5px solid var(--color-system-gray5);'
    const enabledStyles =
        'background: var(--color-system-background); color: var(--color-secondary-label); border: 0.5px solid var(--color-system-gray4);'

    return `
        <a href="${disabled ? '#' : link}" 
                style="${baseStyles} ${disabled ? disabledStyles : enabledStyles}">
            <svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                ${icon}
            </svg>
        </a>
    `
}

function buildPageNumberButton(
    pageItem: number | string,
    currentPage: number,
    provider: string,
    status: string,
    q: string,
    sortBy: string,
    sortOrder: string
): string {
    if (typeof pageItem === 'string') {
        return `<span style="padding: var(--spacing-sm) var(--spacing-md); font-size: 15px; font-weight: var(--font-weight-medium); color: var(--color-tertiary-label);">...</span>`
    }

    const isCurrent = pageItem === currentPage
    const link = buildPageLink(provider, status, q, pageItem, 20, sortBy, sortOrder)

    const baseStyles =
        'padding: var(--spacing-sm) var(--spacing-md); border-radius: var(--radius-md); font-size: 15px; font-weight: var(--font-weight-medium); transition: all 0.2s ease; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; min-width: 32px;'
    const currentStyles = 'background: var(--color-system-blue); color: white; pointer-events: none;'
    const otherStyles =
        'background: var(--color-system-background); color: var(--color-secondary-label); border: 0.5px solid var(--color-system-gray4);'

    return `
        <a href="${isCurrent ? '#' : link}" 
                style="${baseStyles} ${isCurrent ? currentStyles : otherStyles}">
            ${pageItem}
        </a>
    `
}

export function buildPageLink(
    provider: string,
    status: string,
    q: string,
    page: number,
    pageSize: number,
    sortBy: string,
    sortOrder: string
): string {
    const params = new URLSearchParams()
    params.set('status', status)
    if (q) {
        params.set('q', q)
    }
    if (sortBy) {
        params.set('sort_by', sortBy)
        params.set('sort_order', sortOrder)
    }
    if (page > 1) {
        params.set('page', String(page))
    }
    return `/keys/${provider}?${params.toString()}`
}

export function formatUsedTime(createdAt: Date): string {
    const now = Date.now() / 1000
    const usedSeconds = now - createdAt.getTime() / 1000
    const days = Math.floor(usedSeconds / 86400)
    const hours = Math.floor((usedSeconds % 86400) / 3600)
    const minutes = Math.floor((usedSeconds % 3600) / 60)

    if (days > 0) {
        return `${days}d${hours}h`
    }
    if (hours > 0) {
        return `${hours}h${minutes}m`
    }
    return `${minutes}m`
}

export function formatCoolingTime(totalSeconds: number): string {
    if (totalSeconds === 0) return '-'

    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)

    if (days > 0) {
        return `${days}d${hours}h`
    }
    if (hours > 0) {
        return `${hours}h${minutes}m`
    }
    return `${minutes}m`
}

export function buildTableHeader(
    provider: string,
    currentStatus: string,
    q: string,
    statusTabs: string,
    sortBy: string,
    sortOrder: string
): string {
    const deleteAllButton =
        currentStatus === 'blocked'
            ? `
        <button type="submit" name="action" value="delete-all-blocked"
                class="apple-btn-destructive"
                style="padding: var(--spacing-sm) var(--spacing-md); font-size: 15px; background: #d70015;">
            Delete ALL
        </button>
    `
            : ''

    return `
        <div style="padding: var(--spacing-lg); border-bottom: 0.5px solid var(--color-system-gray5); background: var(--color-secondary-system-background);">
            <div style="display: flex; flex-direction: column; gap: var(--spacing-md);">
                <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--spacing-md);">
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-md);">
                        <div style="display: flex; gap: var(--spacing-xs);">${statusTabs}</div>
                        <div style="display: flex; align-items: center;">
                            <div style="position: relative;">
                                <svg style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; color: var(--color-tertiary-label);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                </svg>
                                <input form="search-form" type="search" name="q" value="${q}" 
                                       placeholder="Search keys..." 
                                       class="apple-input" 
                                       style="width: 280px; padding-left: var(--spacing-2xl); padding-right: var(--spacing-md); padding-top: var(--spacing-sm); padding-bottom: var(--spacing-sm);">
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: var(--spacing-xs);">
                        <button type="submit" name="action" value="delete" 
                                class="apple-btn-destructive"
                                style="padding: var(--spacing-sm) var(--spacing-md); font-size: 15px;">
                            Delete Selected
                        </button>
                        ${deleteAllButton}
                    </div>
                </div>
            </div>
        </div>
    `
}

function getSortParamsForNextLink(column: string, currentSortBy: string, currentSortOrder: string) {
    let nextSortOrder = 'desc'
    if (currentSortBy === column) {
        nextSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc'
    }
    return { sortBy: column, sortOrder: nextSortOrder }
}

export function buildTableContent(
    keyRows: string,
    provider: string,
    currentStatus: string,
    q: string,
    sortBy: string,
    sortOrder: string
): string {
    const coolingSortParams = getSortParamsForNextLink('totalCoolingSeconds', sortBy, sortOrder)
    const coolingLink = buildPageLink(
        provider,
        currentStatus,
        q,
        1,
        20,
        coolingSortParams.sortBy,
        coolingSortParams.sortOrder
    )

    const usedTimeSortParams = getSortParamsForNextLink('createdAt', sortBy, sortOrder)
    const usedTimeLink = buildPageLink(
        provider,
        currentStatus,
        q,
        1,
        20,
        usedTimeSortParams.sortBy,
        usedTimeSortParams.sortOrder
    )

    return `
        <div style="overflow-x: auto;">
            <table style="width: 100%; table-layout: fixed;">
                <colgroup>
                    <col style="width: 48px;">
                    <col style="width: 260px;">
                    <col style="width: 200px;">
                    <col style="width: 140px;">
                    <col style="width: 120px;">
                </colgroup>
                <thead>
                    <tr style="background: var(--color-secondary-system-background); border-bottom: 0.5px solid var(--color-system-gray5);">
                        <th style="padding: var(--spacing-md); text-align: left;">
                            <input type="checkbox" 
                                   onchange="document.querySelectorAll('[name=key_id]').forEach(c => c.checked = this.checked)" 
                                   style="width: 16px; height: 16px; accent-color: var(--color-system-blue); border-radius: var(--radius-xs);">
                        </th>
                        <th style="padding: var(--spacing-md); text-align: left; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">API Key</th>
                        <th style="padding: var(--spacing-md); text-align: left; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Remark</th>
                        <th style="padding: var(--spacing-md); text-align: left; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                            <a href="${coolingLink}" style="display: flex; align-items: center; gap: var(--spacing-xs); color: var(--color-system-blue); text-decoration: none; transition: opacity 0.2s ease;">
                                <span>Cooling Time</span>
                                ${getSortIcon('totalCoolingSeconds', sortBy, sortOrder)}
                            </a>
                        </th>
                        <th style="padding: var(--spacing-md); text-align: left; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                            <a href="${usedTimeLink}" style="display: flex; align-items: center; gap: var(--spacing-xs); color: var(--color-system-blue); text-decoration: none; transition: opacity 0.2s ease;">
                                <span>Used Time</span>
                                ${getSortIcon('createdAt', sortBy, sortOrder)}
                            </a>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    ${keyRows}
                </tbody>
            </table>
        </div>
    `
}

export function buildTableFooter(total: number, paginationControls: string): string {
    if (total === 0) {
        return ''
    }

    if (!paginationControls) {
        return `
        <div style="display: flex; justify-content: center; align-items: center; padding: var(--spacing-lg); border-top: 0.5px solid var(--color-system-gray5); background: var(--color-secondary-system-background);">
            <div style="padding: var(--spacing-sm) var(--spacing-md); border-radius: var(--radius-lg); background: var(--color-system-background); color: var(--color-secondary-label); font-size: 15px; font-weight: var(--font-weight-semibold); border: 0.5px solid var(--color-system-gray4);">
                ${total} items
            </div>
        </div>
    `
    }

    return `
        <div style="display: flex; justify-content: center; align-items: center; padding: var(--spacing-lg); border-top: 0.5px solid var(--color-system-gray5); background: var(--color-secondary-system-background);">
            <div style="display: flex; align-items: center; gap: var(--spacing-xs); padding: var(--spacing-sm); background: var(--color-system-background); border-radius: var(--radius-lg); border: 0.5px solid var(--color-system-gray4);">
                ${paginationControls}
                <div style="height: 20px; width: 0.5px; background: var(--color-system-gray4); margin: 0 var(--spacing-sm);"></div>
                <div style="padding: 0 var(--spacing-sm); color: var(--color-secondary-label); font-size: 15px; font-weight: var(--font-weight-semibold);">
                    ${total} items
                </div>
            </div>
        </div>
    `
}

export function buildSearchForm(provider: string, currentStatus: string): string {
    return `
        <form id="search-form" method="GET" action="/keys/${provider}" class="hidden">
            <input type="hidden" name="status" value="${currentStatus}">
        </form>
    `
}

export function buildAddKeysForm(
    provider: string,
    currentStatus: string,
    q: string,
    page: number,
    sortBy: string,
    sortOrder: string
): string {
    return `
        <div class="apple-card" style="padding: var(--spacing-lg); max-width: 1200px; margin: 0 auto;">
            <div style="display: flex; align-items: center; gap: var(--spacing-md); margin-bottom: var(--spacing-lg);">
                <div style="padding: var(--spacing-sm); background: var(--color-secondary-system-background); border-radius: var(--radius-lg); border: 0.5px solid var(--color-system-gray4);">
                    <svg style="width: 20px; height: 20px; color: var(--color-system-blue);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                    </svg>
                </div>
                <h2 style="font-size: 20px; font-weight: var(--font-weight-semibold); color: var(--color-label); margin: 0; line-height: 1.4; letter-spacing: -0.011em;">Add New Keys</h2>
            </div>
            <form method="POST" style="display: flex; flex-direction: column; gap: var(--spacing-lg);">
                <input type="hidden" name="action" value="add">
                <div>
                    <label style="display: block; color: var(--color-label); font-size: 17px; font-weight: var(--font-weight-semibold); margin-bottom: var(--spacing-sm); line-height: 1.29412; letter-spacing: -0.022em;">API Keys</label>
                    <textarea name="keys" 
                              class="apple-input" 
                              style="width: 100%; padding: var(--spacing-md); font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Fira Mono', 'Droid Sans Mono', 'Consolas', monospace; font-size: 15px; resize: none; min-height: 120px;"
                              rows="5" 
                              placeholder="Enter API keys, one per line or separated by commas"></textarea>
                </div>
                <div>
                    <label style="display: block; color: var(--color-label); font-size: 17px; font-weight: var(--font-weight-semibold); margin-bottom: var(--spacing-sm); line-height: 1.29412; letter-spacing: -0.022em;">Remark</label>
                    <input name="remark"
                              class="apple-input"
                              style="width: 100%; padding: var(--spacing-md);"
                              placeholder="Enter remark for these keys (optional)"/>
                </div>
                <div style="display: flex; justify-content: flex-end;">
                    <button type="submit" 
                            formaction="/keys/${provider}${buildPageLink(provider, currentStatus, q, page, 20, sortBy, sortOrder)}" 
                            class="apple-btn-primary"
                            style="padding: var(--spacing-md) var(--spacing-lg);">
                        Add Keys
                    </button>
                </div>
            </form>
        </div>
    `
}

export function buildModelCoolingsModal(): string {
    return `
        <div id="modelCoolingsModal" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); display: none; align-items: center; justify-content: center; z-index: 50; padding: var(--spacing-lg);" onclick="closeModal(event)">
            <div class="apple-card" style="max-width: 600px; width: 100%; max-height: 80vh; overflow: hidden;" onclick="event.stopPropagation()">
                <div style="padding: var(--spacing-lg); border-bottom: 0.5px solid var(--color-system-gray5); background: var(--color-secondary-system-background);">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <h3 style="font-size: 20px; font-weight: var(--font-weight-semibold); color: var(--color-label); margin: 0; line-height: 1.4; letter-spacing: -0.011em;">Model Cooling Details</h3>
                        <button onclick="closeModal()" style="padding: var(--spacing-sm); background: none; border: none; border-radius: var(--radius-md); cursor: pointer; transition: background-color 0.2s ease;" onmouseover="this.style.backgroundColor='var(--color-secondary-system-fill)'" onmouseout="this.style.backgroundColor='transparent'">
                            <svg style="width: 20px; height: 20px; color: var(--color-secondary-label);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                    <p style="font-size: 15px; color: var(--color-secondary-label); margin-top: var(--spacing-sm); margin-bottom: 0;">Key: <span id="modalKeyName" style="font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Fira Mono', 'Droid Sans Mono', 'Consolas', monospace; font-size: 13px;"></span></p>
                </div>
                <div style="padding: var(--spacing-lg); overflow-y: auto; max-height: 400px;">
                    <div id="modelCoolingsTable"></div>
                </div>
            </div>
        </div>
    `
}

export function buildModalScript(): string {
    return `
        <script>
            function showModelCoolings(modelCoolingsJson, keyName) {
                const modalKeyName = document.getElementById('modalKeyName');
                const modalTable = document.getElementById('modelCoolingsTable');
                const modal = document.getElementById('modelCoolingsModal');
                
                modalKeyName.textContent = keyName;
                
                try {
                    const modelCoolings = JSON.parse(modelCoolingsJson);
                    const now = Date.now() / 1000;
                    
                    if (Object.keys(modelCoolings).length === 0) {
                        modalTable.innerHTML = '<p style="color: var(--color-secondary-label); text-align: center; padding: var(--spacing-3xl); font-size: 17px;">No model cooling data available</p>';
                    } else {
                        const rows = Object.entries(modelCoolings).map(([model, cooling]) => {
                            const isAvailable = cooling.end_at < now;
                            const remainingTime = isAvailable ? '-' : formatTime(cooling.end_at - now);
                            const totalTime = formatTime(cooling.total_seconds);
                            const statusClass = isAvailable ? 'color: var(--color-system-green); background: rgba(52, 199, 89, 0.1); border: 0.5px solid rgba(52, 199, 89, 0.2);' : 'color: var(--color-system-red); background: rgba(255, 59, 48, 0.1); border: 0.5px solid rgba(255, 59, 48, 0.2);';
                            const status = isAvailable ? 'available' : 'cooling';
                            
                            return \`
                                <tr style="border-bottom: 0.5px solid var(--color-system-gray5);">
                                    <td style="padding: var(--spacing-md); font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Fira Mono', 'Droid Sans Mono', 'Consolas', monospace; font-size: 13px; color: var(--color-label);">\${model}</td>
                                    <td style="padding: var(--spacing-md); font-size: 15px; color: var(--color-label);">\${totalTime}</td>
                                    <td style="padding: var(--spacing-md); font-size: 15px; color: var(--color-label);">\${remainingTime}</td>
                                    <td style="padding: var(--spacing-md);">
                                        <span style="padding: var(--spacing-xs) var(--spacing-sm); border-radius: var(--radius-sm); font-size: 12px; font-weight: var(--font-weight-medium); \${statusClass}">\${status}</span>
                                    </td>
                                </tr>
                            \`;
                        }).join('');
                        
                        modalTable.innerHTML = \`
                            <table style="width: 100%; border-radius: var(--radius-md); overflow: hidden; border: 0.5px solid var(--color-system-gray5);">
                                <thead>
                                    <tr style="background: var(--color-secondary-system-background); border-bottom: 0.5px solid var(--color-system-gray5);">
                                        <th style="padding: var(--spacing-md); text-align: left; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Model</th>
                                        <th style="padding: var(--spacing-md); text-align: left; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Total Cooling Time</th>
                                        <th style="padding: var(--spacing-md); text-align: left; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Remaining Time</th>
                                        <th style="padding: var(--spacing-md); text-align: left; font-weight: var(--font-weight-semibold); color: var(--color-secondary-label); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    \${rows}
                                </tbody>
                            </table>
                        \`;
                    }
                } catch (e) {
                    modalTable.innerHTML = '<p style="color: var(--color-system-red); text-align: center; padding: var(--spacing-3xl); font-size: 17px;">Error parsing model cooling data</p>';
                }
                
                modal.style.display = 'flex';
            }
            
            function closeModal(event) {
                if (!event || event.target === event.currentTarget) {
                    const modal = document.getElementById('modelCoolingsModal');
                    modal.style.display = 'none';
                }
            }
            
            function formatTime(seconds) {
                if (seconds <= 0) return '-';
                
                const days = Math.floor(seconds / 86400);
                const hours = Math.floor((seconds % 86400) / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                
                if (days > 0) {
                    return \`\${days}d\${hours}h\`;
                }
                if (hours > 0) {
                    return \`\${hours}h\${minutes}m\`;
                }
                return \`\${minutes}m\`;
            }
        </script>
    `
}

function getSortIcon(column: string, sortBy: string, sortOrder: string): string {
    if (sortBy !== column) {
        return `<svg style="width: 16px; height: 16px; color: var(--color-tertiary-label);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"></path>
        </svg>`
    }
    return sortOrder === 'asc'
        ? `<svg style="width: 16px; height: 16px; color: var(--color-system-blue);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4"></path>
        </svg>`
        : `<svg style="width: 16px; height: 16px; color: var(--color-system-blue);" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H7"></path>
        </svg>`
}

export function buildCopyScript(): string {
    return `
        <script>
            function copyToClipboard(text, element) {
                navigator.clipboard.writeText(text).then(() => {
                    const tooltip = element.nextElementSibling;
                    tooltip.style.opacity = '1';
                    setTimeout(() => {
                        tooltip.style.opacity = '0';
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy text: ', err);
                });
            }
        </script>
    `
}
