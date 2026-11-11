/**
 * A real S3 ListObjectsV2 response for the Overture release prefixes, copied
 * from https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&prefix=release/&delimiter=/
 * on 2026-11-11. The order is shuffled here on purpose: S3 returns keys in
 * lexical order, but the picker must not rely on that.
 */
export const OVERTURE_RELEASE_LISTING_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>overturemaps-us-west-2</Name><Prefix>release/</Prefix><KeyCount>3</KeyCount><MaxKeys>1000</MaxKeys><Delimiter>/</Delimiter><IsTruncated>false</IsTruncated><CommonPrefixes><Prefix>release/2026-10-21.0/</Prefix></CommonPrefixes><CommonPrefixes><Prefix>release/2026-09-23.0/</Prefix></CommonPrefixes><CommonPrefixes><Prefix>release/2026-09-23.1/</Prefix></CommonPrefixes></ListBucketResult>`;
