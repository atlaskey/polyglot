const fs = require('fs');
const axios = require('axios');
const { parseStringPromise } = require('xml2js');

class webdav {
  constructor(pe) {
    this.url = p.url
    this.auth = { username: pe.user, password: pe.pass }
  }
  
  async list(href = '') {
    try {
      const res = await axios.request({
        url: this.url + href,
        method: 'PROPFIND',
        auth: this.auth,
        headers: { Depth: '1' },
        validateStatus: () => true
      });
  
      if (res.status < 200 || res.status >= 300) {
        return {
          connected: false,
          error: `Connection error: ${res.status} ${res.statusText}`
        };
      }
  
      const parsed = await parseStringPromise(res.data, {
        explicitArray: false,
        ignoreAttrs: false
      });

      return { connected: true, data: this.extractFiles(parsed) };
  
    } catch (err) {
      return {
        connected: false,
        error: err.message
      };
    }
  }
  
  async createDirectory(path) {
    try {
      const encodedPath = path
        .split('/')
        .map(p => encodeURIComponent(p))
        .join('/');
  
      const res = await axios.request({
        url: this.url + encodedPath,
        method: 'MKCOL',
        auth: this.auth,
        validateStatus: () => true
      });
  
      if (res.status === 201) {
        return { success: true };
      }
  
      if (res.status === 405) {
        return { success: false, error: 'Directory already exists' };
      }
  
      return {
        success: false,
        error: `Error: ${res.status} ${res.statusText}`
      };
  
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }
  
  async delete(remotePath) {
    try {
      const encodedPath = remotePath
        .split('/')
        .map(p => encodeURIComponent(p))
        .join('/');
  
      const res = await axios.request({
        url: this.url + encodedPath,
        method: 'DELETE',
        auth: this.auth,
        validateStatus: () => true
      });
  
      if (res.status >= 200 && res.status < 300) {
        return { success: true };
      }
  
      return {
        success: false,
        error: `Delete error: ${res.status} ${res.statusText}`
      };
  
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  
  async uploadFile(localPath, remotePath) {
    try {
      if(!fs.existsSync(localPath)) return {
        success: false,
        error: `Upload error: file not found - ${localPath}`
      };

      const fileBuffer = fs.readFileSync(localPath);
  
      const encodedPath = remotePath
        .split('/')
        .map(p => encodeURIComponent(p))
        .join('/');
  
      const res = await axios.request({
        url: this.url + encodedPath,
        method: 'PUT',
        auth: this.auth,
        headers: { 'Content-Type': 'application/octet-stream' },
        data: fileBuffer,
        validateStatus: () => true
      });
  
      if (res.status >= 200 && res.status < 300) {
        return { success: true };
      }
  
      return {
        success: false,
        error: `Upload error: ${res.status} ${res.statusText}`
      };
  
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  
  async downloadFile(remotePath, localPath) {
    try {
      const encodedPath = remotePath
        .split('/')
        .map(p => encodeURIComponent(p))
        .join('/');
  
      const res = await axios.request({
        url: this.url + encodedPath,
        method: 'GET',
        auth: this.auth,
        responseType: 'stream',
        validateStatus: () => true
      });
  
      if (res.status >= 200 && res.status < 300) {
        const writer = fs.createWriteStream(localPath);
        res.data.pipe(writer);
  
        return new Promise((resolve, reject) => {
          writer.on('finish', () => resolve({ success: true }));
          writer.on('error', reject);
        });
      }
  
      return {
        success: false,
        error: `Download error: ${res.status} ${res.statusText}`
      };
  
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  
  extractFiles(parsed) {
    const multistatus = parsed['d:multistatus'] || parsed['multistatus'];
    if (!multistatus) return [];
  
    let responses = multistatus['d:response'] || multistatus['response'];
    if (!responses) return [];
  
    if (!Array.isArray(responses)) {
      responses = [responses];
    }
  
    return responses.map(r => {
      const href = r['d:href'] || r['href'];
  
      const propstat = r['d:propstat'] || r['propstat'];
      const prop = propstat?.['d:prop'] || propstat?.['prop'];
  
      const size = prop?.['d:getcontentlength'] || prop?.['getcontentlength'];
      const lastModified = prop?.['d:getlastmodified'] || prop?.['getlastmodified'];
      const resourceType = prop?.['d:resourcetype'] || prop?.['resourcetype'];
  
      const isDirectory = resourceType && resourceType['d:collection'] !== undefined ? true : false;
      const name = decodeURIComponent(href).split('/').filter(Boolean).pop();

      return {
        href,
        name,
        size: size ? Number(size) : null,
        lastModified,
        isDirectory
      };
    })
  }
}

module.exports = webdav;
