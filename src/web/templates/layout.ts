// HTML 布局模板

export function layout(content: string): string {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>One Balance</title>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚖️</text></svg>">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            ${getAppleDesignCSS()}
        </style>
        <script>
            ${getUtilityScripts()}
        </script>
    </head>
    <body class="min-h-screen flex flex-col">
        <main style="padding: var(--spacing-3xl) var(--spacing-lg); max-width: 1400px; margin: 0 auto; flex-grow: 1;">
            ${content}
        </main>
        ${getFooter()}
    </body>
    </html>
    `
}

function getAppleDesignCSS(): string {
    return `
            :root {
                /* Apple System Colors */
                --color-system-blue: #007AFF;
                --color-system-green: #34C759;
                --color-system-red: #FF3B30;
                --color-system-orange: #FF9500;
                --color-system-yellow: #FFCC00;
                --color-system-purple: #AF52DE;
                --color-system-pink: #FF2D92;
                --color-system-teal: #64D2FF;
                --color-system-gray: #8E8E93;
                --color-system-gray2: #AEAEB2;
                --color-system-gray3: #C7C7CC;
                --color-system-gray4: #D1D1D6;
                --color-system-gray5: #E5E5EA;
                --color-system-gray6: #F2F2F7;
                
                /* Apple Semantic Colors */
                --color-label: #000000;
                --color-secondary-label: #3C3C43;
                --color-tertiary-label: #3C3C43;
                --color-quaternary-label: #3C3C43;
                --color-system-background: #FFFFFF;
                --color-secondary-system-background: #F2F2F7;
                --color-tertiary-system-background: #FFFFFF;
                --color-system-fill: #78788033;
                --color-secondary-system-fill: #78788028;
                --color-tertiary-system-fill: #7676801E;
                --color-quaternary-system-fill: #74748014;
                
                /* Apple Typography */
                --font-weight-ultralight: 100;
                --font-weight-thin: 200;
                --font-weight-light: 300;
                --font-weight-regular: 400;
                --font-weight-medium: 500;
                --font-weight-semibold: 600;
                --font-weight-bold: 700;
                --font-weight-heavy: 800;
                --font-weight-black: 900;
                
                /* Apple Spacing (8pt grid) */
                --spacing-xs: 4px;
                --spacing-sm: 8px;
                --spacing-md: 16px;
                --spacing-lg: 24px;
                --spacing-xl: 32px;
                --spacing-2xl: 40px;
                --spacing-3xl: 48px;
                
                /* Apple Corner Radius */
                --radius-xs: 4px;
                --radius-sm: 6px;
                --radius-md: 8px;
                --radius-lg: 12px;
                --radius-xl: 16px;
                --radius-2xl: 20px;
                --radius-3xl: 24px;
            }

            body {
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                background: var(--color-system-gray6);
                color: var(--color-label);
                line-height: 1.47059; /* Apple's standard line height */
                letter-spacing: -0.022em; /* Apple's standard letter spacing */
            }
            
            .apple-card {
                background: var(--color-system-background);
                border-radius: var(--radius-xl);
                border: 0.5px solid var(--color-system-gray5);
                box-shadow: 
                    0 1px 3px rgba(0, 0, 0, 0.1),
                    0 1px 2px rgba(0, 0, 0, 0.06);
                transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
            }
            
            .apple-card:hover {
                transform: translateY(-1px);
                box-shadow: 
                    0 4px 12px rgba(0, 0, 0, 0.15),
                    0 2px 6px rgba(0, 0, 0, 0.1);
            }
            
            .apple-btn-primary {
                background: var(--color-system-blue);
                color: white;
                border: none;
                border-radius: var(--radius-md);
                font-weight: var(--font-weight-semibold);
                font-size: 17px; /* Apple's standard button font size */
                line-height: 1.29412;
                letter-spacing: -0.022em;
                transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                box-shadow: 
                    0 1px 3px rgba(0, 122, 255, 0.3),
                    0 1px 2px rgba(0, 122, 255, 0.2);
            }
            
            .apple-btn-primary:hover {
                background: #0056b3; /* Darker blue on hover */
                transform: translateY(-0.5px);
                box-shadow: 
                    0 2px 6px rgba(0, 122, 255, 0.4),
                    0 1px 3px rgba(0, 122, 255, 0.3);
            }

            .apple-btn-secondary {
                background: var(--color-secondary-system-background);
                color: var(--color-system-blue);
                border: 0.5px solid var(--color-system-gray4);
                border-radius: var(--radius-md);
                font-weight: var(--font-weight-semibold);
                font-size: 17px;
                line-height: 1.29412;
                letter-spacing: -0.022em;
                transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                box-shadow: 
                    0 1px 3px rgba(0, 0, 0, 0.1),
                    0 1px 2px rgba(0, 0, 0, 0.06);
            }

            .apple-btn-destructive {
                background: var(--color-system-red);
                color: white;
                border: none;
                border-radius: var(--radius-md);
                font-weight: var(--font-weight-semibold);
                font-size: 17px;
                line-height: 1.29412;
                letter-spacing: -0.022em;
                transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                box-shadow: 
                    0 1px 3px rgba(255, 59, 48, 0.3),
                    0 1px 2px rgba(255, 59, 48, 0.2);
            }
            
            .apple-input {
                background: var(--color-system-background);
                border: 0.5px solid var(--color-system-gray4);
                border-radius: var(--radius-md);
                color: var(--color-label);
                font-size: 17px;
                line-height: 1.29412;
                letter-spacing: -0.022em;
                transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                box-shadow: 
                    0 1px 3px rgba(0, 0, 0, 0.1),
                    0 1px 2px rgba(0, 0, 0, 0.06);
            }
            
            .apple-input:focus {
                background: var(--color-system-background);
                border-color: var(--color-system-blue);
                box-shadow: 
                    0 0 0 3px rgba(0, 122, 255, 0.1),
                    0 1px 3px rgba(0, 0, 0, 0.1),
                    0 1px 2px rgba(0, 0, 0, 0.06);
                outline: none;
            }
    `
}

function getUtilityScripts(): string {
    return `
            function copyToClipboard(text, element) {
                navigator.clipboard.writeText(text).then(function() {
                    const tooltip = element.parentElement.querySelector('.copy-tooltip');
                    const originalBg = element.className;
                    
                    element.className = originalBg.replace('bg-gray-100', 'bg-green-100').replace('border-gray-200', 'border-green-300');
                    tooltip.classList.remove('opacity-0');
                    tooltip.classList.add('opacity-100');
                    
                    setTimeout(function() {
                        element.className = originalBg;
                        tooltip.classList.remove('opacity-100');
                        tooltip.classList.add('opacity-0');
                    }, 1500);
                }).catch(function() {
                    console.error('Failed to copy text');
                });
            }
    `
}

function getFooter(): string {
    return `
        <footer style="text-align: center; padding: var(--spacing-3xl) var(--spacing-lg); color: var(--color-secondary-label); font-size: 13px; line-height: 1.38462; border-top: 0.5px solid var(--color-system-gray5);">
            <p style="margin-bottom: var(--spacing-sm);">
                <a href="https://github.com/glidea/one-balance" target="_blank" rel="noopener noreferrer" style="color: var(--color-system-blue); text-decoration: none; font-weight: var(--font-weight-medium); transition: opacity 0.2s ease;">
                    one-balance on GitHub
                </a>
            </p>
            <p>
                <a href="https://github.com/glidea/zenfeed" target="_blank" rel="noopener noreferrer" style="color: var(--color-system-blue); text-decoration: none; font-weight: var(--font-weight-medium); transition: opacity 0.2s ease;">
                    zenfeed — Make RSS 📰 great again with AI 🧠✨!!
                </a>
            </p>
        </footer>
    `
}
