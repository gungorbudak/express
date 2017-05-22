# Preprocessing

## Alignment and quantification

### Alignment for single-end files

    hisat -p 32 -q -x /path/to/index/directory -U ID.fastq -S ID.sam

### Alignment for paired-end files

    hisat -p 32 -q -x /path/to/index/directory -1 ID_1.fastq -2 ID_2.fastq -S ID.sam

### Format conversion, sorting and indexing alignment files

    samtools view -bS ID.sam > ID.bam
    samtools sort ID.bam ID.sorted.bam
    samtools index ID.sorted.bam ID.sorted.bai

### Quantification

    stringtie ID.sorted.bam -p 32 -G /path/to/reference/annotation/file -o ID.gtf

### Merging

    stringtie --merge /path/to/list/of/gtf/files -p 32 -G /path/to/reference/annotation/file -o reference.merged.gtf

### Requantification

    stringtie ID.sorted.bam -p 32 -G reference.merged.gtf -o ID.merged.gtf -e
