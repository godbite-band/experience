import { test, expect } from '@playwright/test';

test('contact offers the original press kits and dated rider without loading PDFs on entry',async({page,request})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const downloaded:string[]=[];
  page.on('request',request=>{if(request.url().endsWith('.pdf'))downloaded.push(request.url());});
  await page.goto('./#contact');
  await expect(page.locator('.press-downloads a')).toHaveCount(3);
  expect(downloaded).toEqual([]);
  for(const [name,size] of [['godbite-press-kit-pl.pdf',14079051],['godbite-press-kit-en.pdf',13761699],['godbite-technical-rider-2023.pdf',32788]] as const){
    const link=page.locator(`.press-downloads a[href$="${name}"]`);
    await expect(link).toHaveAttribute('download','');
    const response=await request.get((await link.getAttribute('href'))!);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('application/pdf');
    const body=await response.body();expect(body.length).toBe(size);expect(body.subarray(0,5).toString()).toBe('%PDF-');
  }
  await page.locator('[data-lang=pl]').click();
  await expect(page.locator('#press-label')).toHaveText('Prasa / Scena');
  await expect(page.locator('.press-downloads a').last()).toContainText('Rider techniczny');
  await expect(page.locator('.press-downloads a').last()).toContainText('2023');
});
